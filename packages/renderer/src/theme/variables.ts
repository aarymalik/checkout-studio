import { TYPE_SCALE_STEPS } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"

/**
 * Token path → CSS custom property.
 *
 * A theme token is addressed one way in a node's styles (`{colors.primary}`)
 * and another way in the stylesheet (`--ck-color-primary`). This module is the
 * one place that knows both, so a node's reference and the variable it compiles
 * to cannot drift.
 *
 * Derived from the path rather than looked up in a table. A table would need an
 * entry per token, and the first token somebody forgot to add would compile to
 * nothing and render as nothing — silently, because CSS discards a declaration
 * it cannot parse.
 *
 * The `--ck-` prefix is not decoration. It keeps theme variables clear of
 * anything a merchant's Custom CSS declares, and it mirrors the design system's
 * `--cs-`, which exists for the matching reason: Tailwind owns `--color-*`, so a
 * token of that name would compile to `--color-surface: var(--color-surface)`
 * and yield an interface with no colours.
 *
 * See docs/theme-system.md § CSS Variable Generation.
 */

export const VARIABLE_PREFIX = "--ck-"

/** The class the checkout's variables are scoped to. Never `:root`. */
export const ROOT_CLASS = "checkout-root"

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

/**
 * The four parts of a type style, named for what they are in CSS rather than
 * for the property they set: `--ck-text-h1-leading`, not `-line-height`.
 */
const TYPE_STYLE_SUFFIX = {
  fontSize: "size",
  lineHeight: "leading",
  letterSpacing: "tracking",
  fontWeight: "weight",
  textTransform: "transform",
} as const

type TypeStyleField = keyof typeof TYPE_STYLE_SUFFIX

const TYPE_STYLE_FIELDS = Object.keys(TYPE_STYLE_SUFFIX) as readonly TypeStyleField[]

/**
 * The variable a token path compiles to, or null if the path names nothing.
 *
 * Validating the path here rather than translating any string is what makes an
 * unresolvable reference detectable. `{colors.primry}` has to become a reported
 * fallback, not `var(--ck-color-primry)` and an invisible element.
 */
export function variableFor(path: string): string | null {
  const parts = path.split(".")
  const [group, ...rest] = parts

  if (group === undefined || rest.length === 0) return null

  switch (group) {
    case "colors":
      return colorVariable(rest)
    case "typography":
      return typographyVariable(rest)
    case "spacing":
      return spacingVariable(rest)
    case "radius":
    case "shadows":
      return rest.length === 1 && rest[0] !== undefined
        ? `${VARIABLE_PREFIX}${group === "radius" ? "radius" : "shadow"}-${kebab(rest[0])}`
        : null
    case "motion":
      return motionVariable(rest)
    default:
      return null
  }
}

function colorVariable(rest: readonly string[]): string | null {
  if (rest.length === 1 && rest[0] !== undefined) {
    return `${VARIABLE_PREFIX}color-${kebab(rest[0])}`
  }
  if (rest.length === 2 && rest[0] === "custom" && rest[1] !== undefined) {
    return `${VARIABLE_PREFIX}color-custom-${kebab(rest[1])}`
  }

  return null
}

function typographyVariable(rest: readonly string[]): string | null {
  const [area, first, second] = rest

  if (area === "fontFamily" && rest.length === 2 && first !== undefined) {
    return `${VARIABLE_PREFIX}font-${kebab(first)}`
  }

  if (area === "scale" && rest.length === 3 && first !== undefined && second !== undefined) {
    const suffix = TYPE_STYLE_SUFFIX[second as TypeStyleField]

    return suffix === undefined ? null : `${VARIABLE_PREFIX}text-${kebab(first)}-${suffix}`
  }

  return null
}

function spacingVariable(rest: readonly string[]): string | null {
  if (rest.length !== 1 || rest[0] === undefined) return null
  if (!/^\d+$/.test(rest[0])) return null

  return `${VARIABLE_PREFIX}space-${rest[0]}`
}

const MOTION_NAMES = {
  durationFast: "duration-fast",
  durationNormal: "duration-normal",
  durationSlow: "duration-slow",
  easing: "easing",
} as const

function motionVariable(rest: readonly string[]): string | null {
  if (rest.length !== 1 || rest[0] === undefined) return null

  const name = MOTION_NAMES[rest[0] as keyof typeof MOTION_NAMES]

  return name === undefined ? null : `${VARIABLE_PREFIX}${name}`
}

/**
 * Every token path a theme offers, in emission order.
 *
 * Enumerated from the theme itself, so a spacing scale of nine steps yields
 * nine paths and a tenth custom colour appears without anything being told
 * about it.
 */
export function tokenPaths(theme: CheckoutTheme): readonly string[] {
  const paths: string[] = []

  for (const key of Object.keys(theme.colors)) {
    if (key !== "custom") paths.push(`colors.${key}`)
  }
  for (const key of Object.keys(theme.colors.custom)) {
    paths.push(`colors.custom.${key}`)
  }

  for (const key of Object.keys(theme.typography.fontFamily)) {
    paths.push(`typography.fontFamily.${key}`)
  }
  for (const step of TYPE_SCALE_STEPS) {
    for (const field of TYPE_STYLE_FIELDS) {
      if (theme.typography.scale[step][field] !== undefined) {
        paths.push(`typography.scale.${step}.${field}`)
      }
    }
  }

  for (let index = 0; index < theme.spacing.scale.length; index += 1) {
    paths.push(`spacing.${index}`)
  }

  for (const key of Object.keys(theme.radius)) paths.push(`radius.${key}`)
  for (const key of Object.keys(theme.shadows)) paths.push(`shadows.${key}`)
  for (const key of Object.keys(theme.motion)) paths.push(`motion.${key}`)

  return paths
}

/**
 * Numeric tokens that are lengths.
 *
 * A spacing step of `24` means 24px. A font weight of `700` means 700, and
 * `font-weight: 700px` is a declaration the browser discards — silently, which
 * is how a theme ends up rendering everything at the default weight with
 * nothing to show why.
 */
export function isLengthToken(path: string): boolean {
  return path.startsWith("spacing.")
}

/** The value at a token path, or undefined if the theme has nothing there. */
export function readToken(theme: CheckoutTheme, path: string): string | number | undefined {
  const parts = path.split(".")

  // `spacing.6` addresses the scale by index, which is the shape the reference
  // syntax in docs/theme-system.md uses.
  const index = parts[1]
  if (parts[0] === "spacing" && parts.length === 2 && index !== undefined && /^\d+$/.test(index)) {
    return theme.spacing.scale[Number(index)]
  }

  let cursor: unknown = theme

  for (const part of parts) {
    if (typeof cursor !== "object" || cursor === null) return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }

  return typeof cursor === "string" || typeof cursor === "number" ? cursor : undefined
}
