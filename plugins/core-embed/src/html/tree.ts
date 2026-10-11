/**
 * Author-supplied markup, as something that cannot hold a script.
 *
 * ## Why a tree and not a sanitised string
 *
 * The usual shape of this feature is: keep the author's HTML as text, run it
 * through a sanitiser, and inject the result with `dangerouslySetInnerHTML`.
 * That leaves the dangerous value expressible at every step and relies on a
 * filter being right about it.
 *
 * Here the stored value is a tree of allowlisted elements and text. There is
 * no branch of this type that a `<script>` fits in, so the schema cannot carry
 * one — which is docs/security.md § Scripts on Checkout Pages, "the schema
 * never contains executable code", enforced by the shape of the data rather
 * than by a step somebody has to remember to run.
 *
 * It also keeps two promises the renderer already makes. It writes raw HTML in
 * exactly one place — the stylesheet — and `scripts/check-renderer-deps.mjs`
 * fails the build on a second one; a tree renders through `createElement` and
 * needs none. And a published checkout downloads no parser and no sanitiser,
 * because the parsing happened in the editor and what shipped is the result.
 *
 * The class of bug this sidesteps is mutation XSS, where markup that survives
 * a filter means something different once the browser reparses it. That needs
 * an `innerHTML` round-trip to exist. Nothing here serialises back to HTML.
 *
 * ## What is allowed
 *
 * Text markup: paragraphs, headings, lists, tables, emphasis, links. The
 * things a merchant writes a block of copy with.
 *
 * Not `<img>`: a source would be an origin outside the asset pipeline, which
 * a published checkout's CSP refuses for the same reason Video is self-hosted
 * only. Not `<iframe>`, `<object>` or `<embed>`: third-party frames are the
 * Embed component's business, where the provider is known. Not `<form>` or
 * any field: a form inside a page that already has a payment form is a way to
 * collect card details in a box Stripe never sees. Not `<svg>`: SVG carries
 * its own script surface and needs its own sanitiser, deferred with custom SVG
 * upload to Phase 14.
 *
 * Not `style`, and not `id`. Style belongs to the cascade, which the inspector
 * drives; an inline declaration would be a seventh stage that always wins. An
 * id is page-global — a block that sets one can break an anchor, a label's
 * `for`, or an `aria-describedby` somewhere else on the page.
 *
 * ## No Zod in this file, and that is deliberate
 *
 * Everything here is reachable from the plugin's `./renderer` entry, which is
 * what a paying customer downloads. A validator built from a schema library
 * would put that library in the bundle for the sake of a check that is an
 * allowlist lookup — see content.ts, which does it by hand and is the only
 * check both the renderer and the publish path run.
 */

/** Elements that may hold other elements. */
const CONTAINER_TAGS = [
  "p",
  "div",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "code",
  "small",
  "sub",
  "sup",
  "abbr",
  "time",
  "mark",
] as const

/** Elements that hold nothing, and are written without a closing tag. */
const VOID_TAGS = ["br", "hr"] as const

export const HTML_TAGS = [...CONTAINER_TAGS, ...VOID_TAGS] as const

export type HtmlTag = (typeof HTML_TAGS)[number]

export const HTML_TAG_SET: ReadonlySet<string> = new Set(HTML_TAGS)

/** A tag that may not hold children, whatever the author wrote inside it. */
export const VOID_TAG_SET: ReadonlySet<string> = new Set(VOID_TAGS)

/**
 * Elements the browser lays out as blocks.
 *
 * Read only by the serialiser, to decide where it may put a line break: the
 * whitespace around a block element is not content, and the whitespace around
 * an inline one is. Getting that wrong means markup that grows indentation
 * every time somebody opens and saves it.
 */
export const BLOCK_TAG_SET: ReadonlySet<string> = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "hr",
])

/**
 * Which attributes each element may carry.
 *
 * Per tag rather than one list, because an attribute is only safe on the
 * element it belongs to: `href` on an anchor is a destination, and the same
 * name elsewhere is something a filter let through without reading.
 *
 * `class` is everywhere, since the point of allowing it is that a Code Block's
 * CSS can reach what an HTML Block wrote.
 */
export const GLOBAL_ATTRIBUTES: readonly string[] = ["class"]

export const TAG_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "target", "rel"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
  time: ["datetime"],
  abbr: ["title"],
  ol: ["start", "reversed"],
}

/** Whether this element may carry this attribute. */
export function attributeAllowed(tag: string, name: string): boolean {
  return GLOBAL_ATTRIBUTES.includes(name) || (TAG_ATTRIBUTES[tag]?.includes(name) ?? false)
}

/*
 * Aliases rather than interfaces, and mutable rather than readonly, because
 * this has to be a `PropValue`.
 *
 * A tree is stored in a node's prop like any other value, and the schema's
 * `PropValue` ends in an index signature. TypeScript gives a type alias an
 * implicit one and withholds it from an interface, and a `readonly` array is
 * not assignable to the mutable one either — so written the obvious way, the
 * tree is a shape the document cannot hold, and nothing says so until a prop
 * is assigned.
 *
 * Written this way the compiler checks the thing that matters: what the
 * editor produces is something a document can store.
 */
export type HtmlText = { text: string }

export type HtmlElement = {
  tag: HtmlTag
  attrs?: Record<string, string>
  children?: HtmlNode[]
}

export type HtmlNode = HtmlText | HtmlElement

/** How deep a tree may nest. */
export const MAX_DEPTH = 32
