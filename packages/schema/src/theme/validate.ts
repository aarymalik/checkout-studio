import type { CheckoutTheme, FontDefinition, ThemeShadows, TypeStyle } from "./types"

/**
 * Theme value validation.
 *
 * A theme is user-authored data that becomes CSS. Zod has already checked that
 * every field is a string of a sane length; this file checks that every string
 * is the *kind* of CSS it claims to be, and that none of them can escape the
 * declaration they are emitted into.
 *
 * Two layers, and both matter:
 *
 *   1. `isSafeCssValue` — can this string break out of `property: value`?
 *      Applied to every value, theme or node, before it reaches a stylesheet.
 *   2. the typed checks — is this actually a colour / length / shadow?
 *      Applied where the theme's shape says what a value should be.
 *
 * A value that fails either is never emitted. The renderer falls back to the
 * component default and reports it, per docs/error-handling.md
 * (`THEME_TOKEN_UNRESOLVED`, severity info).
 *
 * See docs/theme-system.md § Security Considerations.
 */

export interface ThemeProblem {
  /** Dotted path into the theme, e.g. `colors.primary`. */
  path: string
  value: string
  reason: string
}

/**
 * Sequences that must never appear in a value, whatever it claims to be.
 *
 * `expression()` and `-moz-binding` executed script in browsers we no longer
 * support, and are kept out because a theme is data that outlives our
 * assumptions about which browsers read it.
 */
const FORBIDDEN_SEQUENCES = [
  "@import",
  "expression(",
  "behavior:",
  "-moz-binding",
  "javascript:",
  "vbscript:",
  "/*",
  "*/",
  "<",
  ">",
]

/** Only these may appear inside `url()`. A data: URI can carry a whole document. */
const URL_PREFIXES = ["https://", "//", "/"]

/**
 * Structural characters that end a declaration.
 *
 * A value containing `;` or `}` would close its own rule and open whatever
 * follows, which is the entire CSS injection attack in one character.
 */
const STRUCTURAL = /[;{}]/

/** @returns true when every parenthesis closes and every quote is matched. */
function isBalanced(value: string): boolean {
  let depth = 0
  let quote: string | null = null

  for (const character of value) {
    if (quote !== null) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "(") depth += 1
    if (character === ")") {
      depth -= 1
      if (depth < 0) return false
    }
  }

  return depth === 0 && quote === null
}

/**
 * @returns true when every `url(...)` in the value points somewhere we permit.
 *
 * Only ever called after `isBalanced`, so every `url(` here has its closing
 * parenthesis.
 */
function hasSafeUrls(value: string): boolean {
  const lowered = value.toLowerCase()
  let index = lowered.indexOf("url(")

  while (index !== -1) {
    const end = value.indexOf(")", index)
    const target = value
      .slice(index + "url(".length, end)
      .trim()
      .replace(/^['"]|['"]$/g, "")

    if (!URL_PREFIXES.some((prefix) => target.startsWith(prefix))) return false

    index = lowered.indexOf("url(", end)
  }

  return true
}

/** Splits `name(arguments)` into its two halves, or null if it is not a call. */
function asCall(value: string): { name: string; arguments: string } | null {
  const open = value.indexOf("(")
  if (open === -1 || !value.endsWith(")")) return null

  return {
    name: value.slice(0, open).toLowerCase(),
    arguments: value.slice(open + 1, -1),
  }
}

/**
 * The universal guard. Every value emitted into a stylesheet passes through it,
 * whether it came from a theme or from a node's own styles.
 */
export function isSafeCssValue(value: string): boolean {
  if (value.trim() === "") return false
  // A backslash can encode any of the forbidden sequences past the scan below
  // — `\6a avascript:` is `javascript:` to a CSS parser.
  if (value.includes("\\")) return false
  if (STRUCTURAL.test(value)) return false

  const lowered = value.toLowerCase()
  if (FORBIDDEN_SEQUENCES.some((sequence) => lowered.includes(sequence))) return false

  return isBalanced(value) && hasSafeUrls(value)
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const COLOR_FUNCTIONS = ["rgb", "rgba", "hsl", "hsla", "oklch", "oklab"]

/**
 * `transparent` and `currentcolor` are permitted alongside the functional
 * notations docs/theme-system.md lists. They carry no values to inject and a
 * ghost button cannot be expressed without one of them.
 */
const COLOR_KEYWORDS = ["transparent", "currentcolor"]

export function isColor(value: string): boolean {
  if (!isSafeCssValue(value)) return false

  const trimmed = value.trim()
  const lowered = trimmed.toLowerCase()

  if (COLOR_KEYWORDS.includes(lowered)) return true
  if (HEX.test(trimmed)) return true

  const call = asCall(trimmed)
  if (call === null || !COLOR_FUNCTIONS.includes(call.name)) return false

  // Components may be numbers, percentages, `none`, or the `/ alpha` separator.
  // Anything else — a nested function, a variable, a keyword — is refused.
  return /^[0-9a-z%.\-\s,/]+$/i.test(call.arguments)
}

const UNITS = ["px", "rem", "em", "%", "vh", "vw", "vmin", "vmax", "ch", "ex", "fr"]
const LENGTH = new RegExp(`^-?(?:\\d+|\\d*\\.\\d+)(?:${UNITS.join("|")})?$`, "i")

/** A number with an allowed unit, or a bare number, which CSS reads as a ratio or zero. */
export function isLength(value: string): boolean {
  return isSafeCssValue(value) && LENGTH.test(value.trim())
}

const DURATION = /^(?:\d+|\d*\.\d+)(?:ms|s)$/i

export function isDuration(value: string): boolean {
  return isSafeCssValue(value) && DURATION.test(value.trim())
}

const NAMED_EASINGS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
]

export function isEasing(value: string): boolean {
  if (!isSafeCssValue(value)) return false

  const trimmed = value.trim()
  if (NAMED_EASINGS.includes(trimmed.toLowerCase())) return true

  const call = asCall(trimmed)
  if (call === null || call.name !== "cubic-bezier") return false

  const numbers = call.arguments.split(",").map((part) => part.trim())
  return numbers.length === 4 && numbers.every((part) => /^-?(?:\d+|\d*\.\d+)$/.test(part))
}

/**
 * A shadow, parsed component-wise rather than passed through.
 *
 * Each layer is two to four lengths, an optional colour, and an optional
 * `inset`, in any order — which is how CSS actually defines it.
 */
export function isShadow(value: string): boolean {
  if (!isSafeCssValue(value)) return false

  const trimmed = value.trim()
  if (trimmed.toLowerCase() === "none") return true

  return splitTopLevel(trimmed, ",").every((layer) => isShadowLayer(layer))
}

function isShadowLayer(layer: string): boolean {
  const parts = splitTopLevel(layer, " ").filter((part) => part !== "")
  if (parts.length === 0) return false

  let lengths = 0
  let colors = 0
  let inset = 0

  for (const part of parts) {
    if (part.toLowerCase() === "inset") {
      inset += 1
      continue
    }
    if (isLength(part)) {
      lengths += 1
      continue
    }
    if (isColor(part)) {
      colors += 1
      continue
    }
    return false
  }

  return lengths >= 2 && lengths <= 4 && colors <= 1 && inset <= 1
}

/** Splits on a separator, ignoring separators inside parentheses. */
function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""

  for (const character of value) {
    if (character === "(") depth += 1
    if (character === ")") depth -= 1
    if (character === separator && depth === 0) {
      parts.push(current.trim())
      current = ""
      continue
    }
    current += character
  }

  parts.push(current.trim())
  return parts
}

const GENERIC_FAMILIES = [
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
  // Not generic families, but keywords all the same: a leading hyphen is
  // otherwise refused, and every system font stack in existence opens with one
  // of these two.
  "-apple-system",
  "blinkmacsystemfont",
]

/**
 * A family name.
 *
 * An allowlist of characters rather than of names: we cannot enumerate every
 * typeface a user may upload, but we can insist a family name is letters,
 * digits, spaces and hyphens — which is what one is. The renderer quotes it on
 * emission, so a name with a space is safe.
 */
const FAMILY_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]*$/

export function isFontFamily(value: string): boolean {
  if (!isSafeCssValue(value)) return false

  const trimmed = value.trim()
  return GENERIC_FAMILIES.includes(trimmed.toLowerCase()) || FAMILY_NAME.test(trimmed)
}

function check(
  problems: ThemeProblem[],
  path: string,
  value: string,
  ok: (value: string) => boolean,
  reason: string,
): void {
  if (!ok(value)) problems.push({ path, value, reason })
}

function checkFont(problems: ThemeProblem[], path: string, font: FontDefinition): void {
  check(problems, `${path}.family`, font.family, isFontFamily, "Expected a font family name.")
  for (const [index, fallback] of font.fallback.entries()) {
    check(
      problems,
      `${path}.fallback.${index}`,
      fallback,
      isFontFamily,
      "Expected a font family name.",
    )
  }
}

function checkTypeStyle(problems: ThemeProblem[], path: string, style: TypeStyle): void {
  check(problems, `${path}.fontSize`, style.fontSize, isLength, "Expected a length.")
  check(problems, `${path}.lineHeight`, style.lineHeight, isLength, "Expected a length or ratio.")
  check(problems, `${path}.letterSpacing`, style.letterSpacing, isLength, "Expected a length.")
}

function checkShadows(problems: ThemeProblem[], path: string, shadows: ThemeShadows): void {
  for (const [key, value] of Object.entries(shadows)) {
    check(problems, `${path}.${key}`, value, isShadow, "Expected a box-shadow.")
  }
}

/**
 * The string-valued entries of a token group.
 *
 * Every group holds strings except `colors`, which also carries the `custom`
 * record, and every group is partial in the dark layer. One filter covers both
 * rather than a `continue` per caller.
 */
function stringEntries(source: Record<string, unknown> | undefined): [string, string][] {
  return Object.entries(source ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  )
}

/**
 * Validates every value in a theme.
 *
 * Returns problems rather than throwing: a theme with one bad shadow still
 * renders a checkout, with that shadow falling back to the component default.
 * Refusing to render the page would be the worse failure by far.
 */
export function validateTheme(theme: CheckoutTheme): ThemeProblem[] {
  const problems: ThemeProblem[] = []

  for (const [key, value] of stringEntries(theme.colors)) {
    check(problems, `colors.${key}`, value, isColor, "Expected a colour.")
  }
  for (const [key, value] of Object.entries(theme.colors.custom)) {
    check(problems, `colors.custom.${key}`, value, isColor, "Expected a colour.")
  }

  for (const [key, font] of Object.entries(theme.typography.fontFamily)) {
    checkFont(problems, `typography.fontFamily.${key}`, font)
  }
  for (const [key, style] of Object.entries(theme.typography.scale)) {
    checkTypeStyle(problems, `typography.scale.${key}`, style)
  }

  for (const [key, value] of Object.entries(theme.radius)) {
    check(problems, `radius.${key}`, value, isLength, "Expected a length.")
  }

  checkShadows(problems, "shadows", theme.shadows)

  check(
    problems,
    "motion.durationFast",
    theme.motion.durationFast,
    isDuration,
    "Expected a duration.",
  )
  check(
    problems,
    "motion.durationNormal",
    theme.motion.durationNormal,
    isDuration,
    "Expected a duration.",
  )
  check(
    problems,
    "motion.durationSlow",
    theme.motion.durationSlow,
    isDuration,
    "Expected a duration.",
  )
  check(problems, "motion.easing", theme.motion.easing, isEasing, "Expected an easing function.")

  if (theme.dark !== undefined) checkDark(problems, theme.dark)

  return problems
}

function checkDark(problems: ThemeProblem[], dark: NonNullable<CheckoutTheme["dark"]>): void {
  for (const [key, value] of stringEntries(dark.colors)) {
    check(problems, `dark.colors.${key}`, value, isColor, "Expected a colour.")
  }
  for (const [key, value] of Object.entries(dark.colors?.custom ?? {})) {
    check(problems, `dark.colors.custom.${key}`, value, isColor, "Expected a colour.")
  }
  for (const [key, value] of stringEntries(dark.radius)) {
    check(problems, `dark.radius.${key}`, value, isLength, "Expected a length.")
  }
  for (const [key, value] of stringEntries(dark.shadows)) {
    check(problems, `dark.shadows.${key}`, value, isShadow, "Expected a box-shadow.")
  }
}
