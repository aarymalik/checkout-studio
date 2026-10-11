import { safeHref } from "@checkout-studio/plugin-sdk"

import { attributeAllowed, HTML_TAGS, MAX_DEPTH, VOID_TAG_SET } from "./tree"
import type { HtmlNode, HtmlTag } from "./tree"

/**
 * Markup an author typed, turned into a tree the schema can hold.
 *
 * ## Editor-side, and nothing in the renderer imports it
 *
 * A published checkout gets the tree, so it has no reason to carry the thing
 * that produced one. This file is reachable from the plugin's `./editor`
 * entry only — the same split that keeps property definitions out of a
 * customer's download, checked by `scripts/check-renderer-bundle.mjs`.
 *
 * ## It parses with the browser, and adds nothing to the bundle
 *
 * `DOMParser` builds an inert document: scripts in it do not run, `<img>` in
 * it fetches nothing, and `onerror` never fires, because the document has no
 * browsing context. The browser already has a correct HTML parser, and a
 * hand-written one would differ from it — which is the gap most sanitiser
 * bypasses live in.
 *
 * What this file does on top of that is a walk: keep the elements on the
 * allowlist, keep the attributes each one is allowed, drop the rest. Nothing
 * is serialised back to HTML at any point, which is what takes the mutation
 * classes of bypass off the table rather than filtering for them.
 *
 * ## Dropped, not escaped
 *
 * A disallowed element's children are kept and the element itself is not:
 * `<marquee>Sale</marquee>` becomes the text "Sale". Somebody who typed a tag
 * we do not support meant the words inside it, and losing their copy because
 * of a tag is worse than losing the tag. A `<script>` is the exception — its
 * children are the script — and so is anything else whose content is not
 * prose.
 */

/** Elements whose content is not prose, and goes with them. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "iframe",
  "object",
  "embed",
  "title",
  "base",
  "link",
  "meta",
  "svg",
  "math",
])

const ALLOWED_TAGS: ReadonlySet<string> = new Set(HTML_TAGS)

/** `target`, when the author set one we understand. */
const TARGETS = new Set(["_blank", "_self"])

export interface ParseResult {
  content: HtmlNode[]
  /**
   * What was removed, as tag and attribute names, each named once.
   *
   * The editor shows these. A filter that silently deletes half of what
   * somebody pasted teaches them that the feature is broken; one that says
   * "script, onclick" teaches them what the rule is.
   */
  removed: readonly string[]
}

/**
 * Parses markup into a tree, reporting what it would not keep.
 *
 * Needs a `DOMParser`, so it runs in a browser or in a test environment that
 * provides one. It does not reach for a polyfill: a server that wanted this
 * would be a server parsing untrusted markup, and the decision was that only
 * the editor does that.
 */
export function parseHtml(source: string): ParseResult {
  const removed = new Set<string>()
  const document = new DOMParser().parseFromString(source, "text/html")

  /*
   * Both halves of the document, and the head is not a formality.
   *
   * A fragment beginning with `<script>` or `<style>` has no body yet, so the
   * parser puts that element in `<head>` — and a walk that started at `body`
   * never saw it. The content was dropped either way, which is why this took
   * a test to notice: what was lost was the report, so a merchant pasting a
   * widget got an empty block and no word about why.
   *
   * Nothing in `<head>` survives the allowlist, so the two are walked as one
   * sequence rather than kept apart.
   */
  const content = [
    ...childrenOf(document.head, removed, 1),
    ...childrenOf(document.body, removed, 1),
  ]

  return { content, removed: [...removed] }
}

function childrenOf(parent: ParentNode, removed: Set<string>, depth: number): HtmlNode[] {
  if (depth > MAX_DEPTH) {
    removed.add(`nesting deeper than ${String(MAX_DEPTH)}`)

    return []
  }

  return [...parent.childNodes].flatMap((node) => convert(node, removed, depth))
}

function convert(node: ChildNode, removed: Set<string>, depth: number): HtmlNode[] {
  if (node.nodeType === 3 /* Node.TEXT_NODE */) {
    const text = node.nodeValue ?? ""

    // Whitespace between block elements is markup's formatting, not content.
    return text.trim() === "" ? [] : [{ text }]
  }

  if (node.nodeType !== 1 /* Node.ELEMENT_NODE */) return []

  const element = node as Element
  const tag = element.tagName.toLowerCase()

  if (DROP_WITH_CONTENT.has(tag)) {
    removed.add(tag)

    return []
  }

  if (!ALLOWED_TAGS.has(tag)) {
    removed.add(tag)

    // Unwrapped: the element goes and its words stay. See the note above.
    return childrenOf(element, removed, depth)
  }

  const children = VOID_TAG_SET.has(tag) ? [] : childrenOf(element, removed, depth + 1)
  const attrs = attributesOf(element, tag, removed)

  return [
    {
      tag: tag as HtmlTag,
      ...(Object.keys(attrs).length === 0 ? {} : { attrs }),
      ...(children.length === 0 ? {} : { children }),
    },
  ]
}

function attributesOf(element: Element, tag: string, removed: Set<string>): Record<string, string> {
  const attrs: Record<string, string> = {}

  for (const { name, value } of element.attributes) {
    if (!attributeAllowed(tag, name)) {
      removed.add(name)
      continue
    }

    const kept = valueFor(tag, name, value)

    if (kept === null) {
      removed.add(name)
      continue
    }

    attrs[name] = kept
  }

  /*
   * An anchor that opens a new tab gets `rel` whatever it arrived with.
   *
   * `noopener` keeps the opened page from reaching back through
   * `window.opener` to navigate the one that opened it, and the page it would
   * be replacing is a checkout. This is `relFor` in the SDK, applied here
   * rather than at render time because here the result is stored and visible,
   * and a merchant who reads the saved tree should see what their link will
   * actually carry.
   */
  if (tag === "a" && attrs["target"] === "_blank") attrs["rel"] = "noopener noreferrer"

  return attrs
}

/** The value to keep for this attribute, or null to drop the attribute. */
function valueFor(tag: string, name: string, value: string): string | null {
  if (tag === "a" && name === "href") return safeHref(value)
  if (tag === "a" && name === "target") return TARGETS.has(value) ? value : null

  /*
   * A `rel` the author wrote is not kept.
   *
   * It is either about to be replaced — an anchor opening a new tab gets the
   * one above — or it is on an anchor staying in this tab, where the values
   * that matter (`noopener`, `noreferrer`) have nothing to act on. What is
   * left is SEO hinting on a checkout page, which is not a thing.
   */
  if (name === "rel") return null

  // A count, and nothing else. `colspan="1e9"` is a table the browser tries
  // to build.
  if (name === "colspan" || name === "rowspan" || name === "start") {
    return /^-?\d{1,4}$/.test(value) ? value : null
  }

  if (name === "scope") return ["row", "col", "rowgroup", "colgroup"].includes(value) ? value : null

  // `reversed` is boolean: present or absent, and its value is not read.
  if (name === "reversed") return ""

  return value
}
