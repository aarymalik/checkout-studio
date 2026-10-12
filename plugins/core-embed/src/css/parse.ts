/**
 * CSS an author typed, turned into something a document can hold.
 *
 * ## The stored value is a structure, not a stylesheet
 *
 * The same argument as HTML Block's tree. A stored string of CSS that the
 * renderer concatenates into the page's stylesheet is arbitrary CSS one
 * tampered document away from the payment form; a stored list of selectors and
 * declarations is re-emitted by the engine's own writer, which scopes every
 * selector and passes every value through the guard the theme already uses.
 *
 * So what is stored cannot be a rule the engine did not write.
 *
 * ## Editor-side
 *
 * The renderer receives the structure and has no reason to carry a parser.
 * Reachable from the plugin's `./editor` entry only.
 *
 * ## What it will not take
 *
 * `@media`, and that is a product decision rather than a safety one. This
 * product has breakpoints as a first-class idea — the inspector sets styles
 * per breakpoint and the renderer emits the queries — and a merchant writing
 * their own would be a second mechanism that the first cannot see. The block
 * reports it rather than dropping it silently.
 *
 * `@import` and `@font-face` fetch from an origin, which a published
 * checkout's CSP refuses; `@keyframes` names animations globally, so two
 * blocks could collide. All three are reported.
 *
 * JavaScript does not arise: there is nowhere in a stylesheet to put any.
 */

/** A declaration block, keyed by property as the document stores properties. */
export type Declarations = Record<string, string>

export interface CssRule {
  selector: string
  declarations: Declarations
}

export interface CssParseResult {
  rules: CssRule[]
  /** What was removed, each named once, for the editor to show. */
  removed: string[]
}

/** `font-size` → `fontSize`, which is how a document stores a property. */
function camelCase(property: string): string {
  return property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

/**
 * Characters that would let a declaration's value out of its own rule.
 *
 * The engine's emitter checks values too — `isSafeCssValue` is what the theme
 * is held to. This is the editor refusing to store what the renderer would
 * then refuse to draw, so the author is told at the point they typed it.
 */
const UNSAFE_VALUE = /[{}@\\]|\/\*/

export function parseCss(source: string): CssParseResult {
  const removed = new Set<string>()
  const rules: CssRule[] = []
  const css = source.replaceAll(/\/\*[\s\S]*?\*\//g, " ")
  let index = 0

  /*
   * A scan rather than a pattern.
   *
   * The first version matched `selector { body }` with a regular expression,
   * which cannot see an at-rule: the body of `@media` contains braces, so the
   * outer block never matched and the rules *inside* it did — a media query
   * was dropped and its rules applied at every width. A test caught it, and
   * the fix is to walk the sheet rather than to make the pattern cleverer.
   */
  while (index < css.length) {
    const character = css[index] as string

    /*
     * Whitespace first, and this is not tidying.
     *
     * The at-rule check below reads the character at the cursor, so a newline
     * in front of `@media` meant the cursor was on the newline and the query
     * was read as an ordinary selector — the rules inside it kept, and applied
     * at every width. The same bug the pattern had, one layer along.
     */
    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if (character === "@") {
      index = skipAtRule(css, index, removed)
      continue
    }

    if (character === "}") {
      // A stray close brace: the author's braces do not balance. Skipping it
      // is what a browser does, and the alternative is reading the rest of
      // the sheet as one selector.
      removed.add("an unmatched }")
      index += 1
      continue
    }

    const open = css.indexOf("{", index)

    if (open === -1) {
      if (css.slice(index).trim() !== "") removed.add("a rule with no declarations")
      break
    }

    const close = css.indexOf("}", open)
    const selector = css.slice(index, open).trim()
    const declarations = declarationsOf(
      css.slice(open + 1, close === -1 ? undefined : close),
      removed,
    )

    if (selector === "") {
      removed.add("a rule with no selector")
    } else if (Object.keys(declarations).length > 0) {
      rules.push({ selector, declarations })
    }

    index = close === -1 ? css.length : close + 1
  }

  return { rules, removed: [...removed] }
}

/** Past an at-rule, whether it ends in a `;` or in a block. */
function skipAtRule(css: string, start: number, removed: Set<string>): number {
  const name = /^@[a-z-]*/i.exec(css.slice(start))?.[0] ?? "@"

  removed.add(name.toLowerCase())

  const semicolon = css.indexOf(";", start)
  const open = css.indexOf("{", start)

  // `@import url(...);` — a statement, with no block to skip.
  if (open === -1 || (semicolon !== -1 && semicolon < open)) {
    return semicolon === -1 ? css.length : semicolon + 1
  }

  let depth = 0

  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1
    if (css[index] === "}") {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }

  return css.length
}

function declarationsOf(body: string, removed: Set<string>): Declarations {
  const declarations: Declarations = {}

  for (const part of body.split(";")) {
    if (part.trim() === "") continue

    const colon = part.indexOf(":")

    if (colon === -1) {
      removed.add("a declaration with no value")
      continue
    }

    const property = part.slice(0, colon).trim().toLowerCase()
    const value = part.slice(colon + 1).trim()

    if (property === "" || value === "") {
      removed.add("a declaration with no value")
      continue
    }

    // A custom property keeps its dashes; the engine's emitter knows the shape.
    const name = property.startsWith("--") ? property : camelCase(property)

    if (!/^(--[a-z0-9-]+|[a-zA-Z][a-zA-Z0-9]*)$/.test(name)) {
      removed.add(property)
      continue
    }

    if (UNSAFE_VALUE.test(value)) {
      removed.add(property)
      continue
    }

    declarations[name] = value
  }

  return declarations
}
