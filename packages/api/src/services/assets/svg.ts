import "server-only"

import {
  ALLOWED_ELEMENTS,
  FRAGMENT_ATTRIBUTES,
  PAINT_ATTRIBUTES,
  attributeAllowed,
  dropsWithContent,
} from "./allowlist"

/**
 * An uploaded SVG, rewritten as one we wrote.
 *
 * ## The output is not the input
 *
 * Nothing here filters a string and hands it back. The bytes are read into a
 * tree of allowlisted elements and escaped text, and then this file writes a
 * new document from that tree. What gets stored is markup we produced, so a
 * construct absent from allowlist.ts has nowhere to be rather than being
 * removed — the argument core-embed's HTML Block makes for keeping markup as a
 * tree, applied to a file.
 *
 * That matters for where the trust sits. **The emitter is the security
 * boundary, not the parser.** A parser bug can misread a shape, or refuse a
 * file that was fine; it cannot produce an element or an attribute the emitter
 * does not know how to write, and it cannot put unescaped text into the
 * output. So the worst outcome of a parsing mistake is a wrong picture or a
 * rejected upload, not script running from our origin.
 *
 * ## The parser refuses rather than guesses
 *
 * HTML Block parses with the browser's own `DOMParser`, and says why: a
 * hand-written HTML parser would differ from the browser's, and that gap is
 * where most sanitizer bypasses live. There is no `DOMParser` on a server, and
 * the risk is smaller here for two reasons. XML is a strict grammar rather
 * than HTML's recovery algorithm, and this parser is allowed to give up:
 * anything it does not fully understand is a refusal, which is the safe
 * direction. Leniency is what bypasses are made of.
 *
 * So: no DOCTYPE (XXE and entity expansion), no CDATA, no processing
 * instruction but the XML declaration, no unquoted attribute value, and no
 * entity reference outside the five XML predefines and numeric ones.
 *
 * See docs/security.md § File Upload Security.
 */

export type SvgRefusal =
  /** Not decodable as UTF-8 text, or empty once decoded. */
  | "not-text"
  /** No `<svg>` root. */
  | "not-svg"
  /** A DOCTYPE, which is how entity expansion and XXE arrive. */
  | "doctype"
  /** A `<![CDATA[`, whose content bypasses text escaping by definition. */
  | "cdata"
  /** A processing instruction other than the XML declaration. */
  | "processing-instruction"
  /** An entity reference that is not one of the five XML predefines. */
  | "entity"
  /** Tags that do not nest, an unterminated tag, an unquoted value. */
  | "malformed"
  /** More nesting or more elements than any logo has. */
  | "too-complex"

export interface SvgSanitized {
  ok: true
  /** The document this file wrote. Safe to store and to serve. */
  bytes: Uint8Array
  /**
   * What was taken out, as element and attribute names, sorted and unique.
   *
   * Reported rather than silently dropped. A logo that lost a `<filter>` will
   * not look the way the merchant exported it, and they can only re-export it
   * if somebody tells them. A `script` in this list is worth more than that —
   * it is the one case where the upload was not an accident.
   */
  removed: readonly string[]
}

export interface SvgRefused {
  ok: false
  reason: SvgRefusal
}

export type SvgResult = SvgSanitized | SvgRefused

/** Deeper than any drawing, shallow enough that recursion cannot run away. */
const MAX_DEPTH = 32

/** A logo is tens of elements. Ten thousand is a generated file or an attack. */
const MAX_ELEMENTS = 10_000

interface Element {
  name: string
  attributes: readonly [string, string][]
  children: Node[]
}

type Node = Element | { text: string }

function isElement(node: Node): node is Element {
  return "name" in node
}

/* ────────────────────────────── reading ────────────────────────────── */

/**
 * Everything a scan carries.
 *
 * Failures are recorded here and signalled by returning null, rather than
 * thrown. An exception would need catching at the top, and the branch for
 * "something other than a refusal escaped" is one nothing can reach — so it
 * would be a branch no test could cover and no reader could justify. Returning
 * null makes every failure path an ordinary one, reachable from an ordinary
 * malformed file.
 */
interface Scan {
  readonly source: string
  at: number
  elements: number
  /**
   * Why the parse stopped.
   *
   * Not nullable, and that is deliberate. `fail` is the only way any read
   * returns null, and it always records a reason before doing so — a parent
   * that sees null from a child just passes the null up. So a nullable field
   * would force a `?? "malformed"` at the top that nothing could ever reach.
   *
   * The initial value is what the summary would be if a read ever returned
   * null without saying why, which is also the truthful name for it.
   */
  refusal: SvgRefusal
  /** Names dropped, collected while the tree is filtered. */
  readonly removed: Set<string>
}

function fail(scan: Scan, reason: SvgRefusal): null {
  scan.refusal = reason

  return null
}

const NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?/

/** Advances past any whitespace. One place, so there is one branch to cover. */
function skipSpace(scan: Scan): void {
  while (/\s/.test(scan.source[scan.at] ?? "")) scan.at += 1
}

/**
 * The five entities XML defines, and nothing else.
 *
 * A document declaring its own needs a DOCTYPE, which is refused before this
 * matters. Numeric references are decoded; anything else is a refusal rather
 * than a pass-through, because an entity this file does not understand is a
 * character it cannot promise to escape.
 */
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

/** The body of a reference, between `&` and `;`. Lengths cap the parse. */
const REFERENCE = /^(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6})$/

function codePointOf(body: string): number {
  return body.startsWith("#x")
    ? Number.parseInt(body.slice(2), 16)
    : Number.parseInt(body.slice(1), 10)
}

/** A code point that is a character we can write back out. */
function codePointUsable(body: string): boolean {
  const code = codePointOf(body)

  // Below a space are the control characters XML mostly forbids; above the
  // last plane is not a character; the surrogate range is half of one.
  if (code < 0x20 || code > 0x10ffff) return false

  return code < 0xd800 || code > 0xdfff
}

/**
 * Whether every `&` in this text begins a reference we understand.
 *
 * Checked before decoding rather than during it, so that decoding has no
 * failure path and this has no decoding in it.
 */
function entitiesUsable(raw: string): boolean {
  let at = raw.indexOf("&")

  while (at !== -1) {
    const end = raw.indexOf(";", at)

    // A bare `&` is not well-formed XML, and guessing where the reference was
    // meant to end is the kind of recovery this parser does not do.
    if (end === -1) return false

    const body = raw.slice(at + 1, end)

    if (!REFERENCE.test(body)) return false
    if (body.startsWith("#") && !codePointUsable(body)) return false

    at = raw.indexOf("&", end)
  }

  return true
}

/** Only ever called on text `entitiesUsable` has passed. */
function decodeEntities(raw: string): string {
  return raw.replace(/&([^;]*);/g, (_match, body: string) => {
    const named = ENTITIES[body]

    return named ?? String.fromCodePoint(codePointOf(body))
  })
}

/** Skips whitespace, comments and the XML declaration. Refuses the rest. */
function skipProlog(scan: Scan): boolean {
  for (;;) {
    skipSpace(scan)

    const here = scan.source.slice(scan.at)

    if (here.startsWith("<!--")) {
      const end = scan.source.indexOf("-->", scan.at)

      if (end === -1) return fail(scan, "malformed") !== null
      scan.at = end + 3
      continue
    }

    // Both spellings, because a case-insensitive DOCTYPE is still a DOCTYPE.
    if (/^<!doctype/i.test(here)) return fail(scan, "doctype") !== null
    if (here.startsWith("<![CDATA[")) return fail(scan, "cdata") !== null

    if (here.startsWith("<?")) {
      // The declaration is the one we accept; `<?php` and friends are not.
      if (!/^<\?xml[\s?]/i.test(here)) return fail(scan, "processing-instruction") !== null

      const end = scan.source.indexOf("?>", scan.at)

      if (end === -1) return fail(scan, "malformed") !== null
      scan.at = end + 2
      continue
    }

    return true
  }
}

function readAttributes(scan: Scan): readonly [string, string][] | null {
  const attributes: [string, string][] = []

  for (;;) {
    skipSpace(scan)

    const character = scan.source[scan.at]

    if (character === undefined) return fail(scan, "malformed")
    if (character === ">" || character === "/") return attributes

    const name = NAME.exec(scan.source.slice(scan.at))?.[0]

    if (name === undefined) return fail(scan, "malformed")
    scan.at += name.length

    skipSpace(scan)
    // A valueless attribute is HTML, not XML. Refusing keeps this parser from
    // having to decide what `hidden` means in a drawing.
    if (scan.source[scan.at] !== "=") return fail(scan, "malformed")
    scan.at += 1
    skipSpace(scan)

    const quote = scan.source[scan.at]

    // Unquoted values are where "how far does this value reach" bugs live.
    if (quote !== '"' && quote !== "'") return fail(scan, "malformed")
    scan.at += 1

    const close = scan.source.indexOf(quote, scan.at)

    if (close === -1) return fail(scan, "malformed")

    const raw = scan.source.slice(scan.at, close)

    scan.at = close + 1

    // A raw `<` in a value is not well-formed, and is how a value pretends to
    // close its own tag.
    if (raw.includes("<")) return fail(scan, "malformed")
    if (!entitiesUsable(raw)) return fail(scan, "entity")

    attributes.push([name, decodeEntities(raw)])
  }
}

function readElement(scan: Scan, depth: number): Element | null {
  if (depth > MAX_DEPTH) return fail(scan, "too-complex")

  scan.elements += 1
  if (scan.elements > MAX_ELEMENTS) return fail(scan, "too-complex")

  if (scan.source[scan.at] !== "<") return fail(scan, "malformed")
  scan.at += 1

  const name = NAME.exec(scan.source.slice(scan.at))?.[0]

  if (name === undefined) return fail(scan, "malformed")
  scan.at += name.length

  const attributes = readAttributes(scan)

  if (attributes === null) return null

  if (scan.source.startsWith("/>", scan.at)) {
    scan.at += 2

    return { name, attributes, children: [] }
  }

  if (scan.source[scan.at] !== ">") return fail(scan, "malformed")
  scan.at += 1

  const children = readChildren(scan, name, depth)

  if (children === null) return null

  return { name, attributes, children }
}

function readChildren(scan: Scan, parent: string, depth: number): Node[] | null {
  const children: Node[] = []

  for (;;) {
    const next = scan.source.indexOf("<", scan.at)

    if (next === -1) return fail(scan, "malformed")

    if (next > scan.at) {
      const raw = scan.source.slice(scan.at, next)

      if (!entitiesUsable(raw)) return fail(scan, "entity")

      const text = decodeEntities(raw)

      if (text.trim() !== "") children.push({ text })
      scan.at = next
    }

    const here = scan.source.slice(scan.at)

    if (here.startsWith("</")) {
      const name = NAME.exec(here.slice(2))?.[0]

      // Tags that do not match make a document whose shape depends on
      // recovery rules, which is exactly what this parser declines to have.
      if (name !== parent) return fail(scan, "malformed")

      const close = scan.source.indexOf(">", scan.at)

      if (close === -1) return fail(scan, "malformed")
      scan.at = close + 1

      return children
    }

    if (here.startsWith("<!--")) {
      const end = scan.source.indexOf("-->", scan.at)

      if (end === -1) return fail(scan, "malformed")
      scan.at = end + 3
      continue
    }

    if (here.startsWith("<![CDATA[")) return fail(scan, "cdata")
    if (/^<!doctype/i.test(here)) return fail(scan, "doctype")
    if (here.startsWith("<?")) return fail(scan, "processing-instruction")
    if (here.startsWith("<!")) return fail(scan, "malformed")

    const element = readElement(scan, depth + 1)

    if (element === null) return null

    children.push(element)
  }
}

/* ────────────────────────────── filtering ────────────────────────────── */

/** A `url(...)` whose target is a reference into this same document. */
const LOCAL_URL = /url\(\s*(?:'#[^']*'|"#[^"]*"|#[^'")\s]*)\s*\)/g

/**
 * Whether a paint value points only inside this document.
 *
 * Counted rather than inspected one at a time: every `url(` in the value must
 * be one of the local ones, so a value mixing `url(#a)` with
 * `url(https://evil.test/b)` fails on the arithmetic. A `url(` the local
 * pattern cannot read is also a value this file will not write.
 */
function paintAllowed(value: string): boolean {
  const lowered = value.trim().toLowerCase()

  const all = [...lowered.matchAll(/url\(/g)].length
  const local = [...lowered.matchAll(LOCAL_URL)].length

  return all === local
}

function valueAllowed(attribute: string, value: string): boolean {
  if (FRAGMENT_ATTRIBUTES.has(attribute)) return value.trim().startsWith("#")
  if (PAINT_ATTRIBUTES.has(attribute)) return paintAllowed(value)

  return true
}

/**
 * One allowed element, with its attributes and children filtered.
 *
 * The caller has already established the element is allowed, which is what
 * lets this return an element rather than something possibly absent — and
 * removes the "what if the root filtered away" branch nothing could reach.
 */
function filterElement(element: Element, removed: Set<string>): Element {
  const attributes = element.attributes.filter(([name, value]) => {
    if (!attributeAllowed(element.name, name)) {
      removed.add(name)

      return false
    }
    if (!valueAllowed(name, value)) {
      removed.add(name)

      return false
    }

    return true
  })

  return { name: element.name, attributes, children: filterChildren(element.children, removed) }
}

/**
 * Children, with everything not allowed taken out.
 *
 * A disallowed element keeps its children unless `dropsWithContent` claims it,
 * for the reason HTML Block gives: somebody whose exporter wrapped the shapes
 * in a `<switch>` meant the shapes.
 */
function filterChildren(nodes: readonly Node[], removed: Set<string>): Node[] {
  const kept: Node[] = []

  for (const node of nodes) {
    if (!isElement(node)) {
      kept.push(node)
      continue
    }

    if (dropsWithContent(node.name)) {
      removed.add(node.name)
      continue
    }

    if (!ALLOWED_ELEMENTS.has(node.name)) {
      removed.add(node.name)
      kept.push(...filterChildren(node.children, removed))
      continue
    }

    kept.push(filterElement(node, removed))
  }

  return kept
}

/* ────────────────────────────── writing ────────────────────────────── */

/**
 * Text, as text.
 *
 * All five, including the quotes, so one function serves text nodes and
 * attribute values. Over-escaping a text node costs nothing; getting an
 * attribute value wrong costs everything.
 */
function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function write(nodes: readonly Node[]): string {
  return nodes
    .map((node) => {
      if (!isElement(node)) return escape(node.text)

      const attributes = node.attributes
        .map(([name, value]) => ` ${name}="${escape(value)}"`)
        .join("")

      if (node.children.length === 0) return `<${node.name}${attributes}/>`

      return `<${node.name}${attributes}>${write(node.children)}</${node.name}>`
    })
    .join("")
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"

/**
 * One namespace, ours.
 *
 * Written rather than carried over, because what is stored is this file's
 * document and not the merchant's: a root that arrived without a namespace is
 * still an SVG to a browser, and one that arrived with somebody else's should
 * not keep it.
 */
function withNamespace(attributes: readonly [string, string][]): readonly [string, string][] {
  const declared = attributes.filter(([name]) => name !== "xmlns" && name !== "xmlns:xlink")

  return [["xmlns", SVG_NAMESPACE], ...declared]
}

/* ────────────────────────────── the gate ────────────────────────────── */

export function sanitizeSvg(bytes: Uint8Array): SvgResult {
  let source: string

  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, reason: "not-text" }
  }

  if (source.trim() === "") return { ok: false, reason: "not-text" }

  const scan: Scan = { source, at: 0, elements: 0, refusal: "malformed", removed: new Set() }

  if (!skipProlog(scan)) return { ok: false, reason: scan.refusal }

  const root = readElement(scan, 0)

  if (root === null) return { ok: false, reason: scan.refusal }
  if (root.name !== "svg") return { ok: false, reason: "not-svg" }

  const filtered = filterElement(root, scan.removed)
  const named: Element = { ...filtered, attributes: withNamespace(filtered.attributes) }

  return {
    ok: true,
    bytes: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>${write([named])}`),
    removed: [...scan.removed].sort(),
  }
}
