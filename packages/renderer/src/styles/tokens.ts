import { isSafeCssValue, isTokenReference, tokenPath } from "@checkout-studio/schema"
import type { CheckoutTheme, StyleProperties } from "@checkout-studio/schema"

import { readToken, tokenPaths, variableFor } from "../theme/variables"

/**
 * Token references in node styles.
 *
 * ```json
 * { "backgroundColor": "{colors.primary}", "padding": "{spacing.6}" }
 * ```
 *
 * A reference compiles to `var(--ck-color-primary)`, so the value the browser
 * paints comes from the theme's stylesheet. That is what makes a rebrand a
 * stylesheet change rather than a re-render.
 *
 * A reference that names nothing falls back to the component default and is
 * reported. Never emitted as `var(--ck-color-primry)`: an invisible element with
 * no error anywhere is the worst of the three outcomes.
 *
 * See docs/theme-system.md § Reference Syntax.
 */

/** `--ck-a → --ck-b → --ck-c` is the most a value may travel. A fourth hop is a design smell. */
export const MAX_REFERENCE_DEPTH = 3

export type ReferenceProblemCode =
  /** The path names nothing in this theme. */
  | "unresolvable"
  /** The chain returns to a path it has already visited. */
  | "circular"
  /** The chain is longer than three hops. */
  | "too-deep"

export interface ReferenceProblem {
  code: ReferenceProblemCode
  /** Where the chain started. */
  path: string
  /** The reference that could not be followed. */
  value: string
  /** Every path visited, in order. */
  chain: readonly string[]
}

/**
 * Follows a reference chain through the theme.
 *
 * Only the theme's own values chain — a node's style reference points at a
 * theme path and stops there.
 */
function follow(
  theme: CheckoutTheme,
  path: string,
): { ok: true; target: string } | { ok: false; problem: ReferenceProblem } {
  const chain: string[] = [path]
  const seen = new Set<string>([path])
  let current = path

  // Reads at most three levels: `{a}` → `{b}` → literal. A fourth is refused.
  for (let level = 1; level <= MAX_REFERENCE_DEPTH; level += 1) {
    const raw = readToken(theme, current)

    if (raw === undefined || variableFor(current) === null) {
      return {
        ok: false,
        problem: { code: "unresolvable", path, value: `{${current}}`, chain },
      }
    }

    if (typeof raw === "number" || !isTokenReference(raw)) {
      return { ok: true, target: current }
    }

    const next = tokenPath(raw) as string

    if (seen.has(next)) {
      return {
        ok: false,
        problem: { code: "circular", path, value: raw, chain: [...chain, next] },
      }
    }

    seen.add(next)
    chain.push(next)
    current = next
  }

  return {
    ok: false,
    problem: { code: "too-deep", path, value: `{${current}}`, chain },
  }
}

/**
 * Every reference in the theme that cannot be followed.
 *
 * Run before the tree is rendered, not during it, which is what
 * docs/theme-system.md means by "circular references are rejected at validation
 * time". A cycle discovered mid-render would already have emitted half a page.
 */
export function referenceProblems(theme: CheckoutTheme): readonly ReferenceProblem[] {
  const problems: ReferenceProblem[] = []

  for (const path of tokenPaths(theme)) {
    const raw = readToken(theme, path)

    if (typeof raw !== "string" || !isTokenReference(raw)) continue

    const result = follow(theme, tokenPath(raw) as string)

    if (!result.ok) problems.push({ ...result.problem, path })
  }

  return problems
}

/**
 * CSS properties whose numeric value carries no unit.
 *
 * A style control writes `16` and means 16px, which is what every number in a
 * node's styles means — except for these, where `font-weight: 700px` and
 * `line-height: 1.6px` are declarations the browser discards without saying so.
 * The list is the same one React keeps for the same reason.
 */
const UNITLESS = new Set([
  "animationIterationCount",
  "aspectRatio",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "columnCount",
  "flex",
  "flexGrow",
  "flexPositive",
  "flexShrink",
  "flexNegative",
  "flexOrder",
  "fontWeight",
  "gridArea",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnStart",
  "gridRow",
  "gridRowEnd",
  "gridRowStart",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "scale",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
  "fillOpacity",
  "floodOpacity",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
])

export type ValueResolution =
  | { ok: true; value: string }
  | { ok: false; reference: string; reason: ReferenceProblemCode | "unsafe" }

/**
 * One style value, ready for a stylesheet.
 *
 * Numbers become pixels, because that is what a number means in every style
 * control in the product. A string is either a reference or a literal, and a
 * literal has to survive the same guard a theme value does — node styles are
 * user-authored too, and `backgroundImage: url(javascript:…)` arrives the same
 * way.
 */
export function resolveValue(
  theme: CheckoutTheme,
  raw: string | number,
  property?: string,
): ValueResolution {
  if (typeof raw === "number") {
    const unitless = property !== undefined && UNITLESS.has(property)

    return { ok: true, value: unitless ? `${raw}` : `${raw}px` }
  }

  if (isTokenReference(raw)) {
    const path = tokenPath(raw) as string
    const followed = follow(theme, path)

    if (!followed.ok) {
      return { ok: false, reference: raw, reason: followed.problem.code }
    }

    // The chain is emitted as a single `var()` at its start: the theme's own
    // variables already reference each other, so the browser walks the rest.
    return { ok: true, value: `var(${variableFor(path) as string})` }
  }

  return isSafeCssValue(raw)
    ? { ok: true, value: raw }
    : { ok: false, reference: raw, reason: "unsafe" }
}

export interface StyleFallback {
  property: string
  /** What was written. */
  value: string
  reason: ReferenceProblemCode | "unsafe"
}

export interface ResolvedDeclarations {
  /** Property → CSS value, both already safe to emit. */
  declarations: Record<string, string>
  /** Properties that fell back to the component default, or were dropped entirely. */
  fallbacks: StyleFallback[]
}

/**
 * Resolves a block of style properties.
 *
 * A property whose value cannot be resolved falls back to the component
 * default; a property with no default is dropped. Both are reported, because
 * the editor shows a warning badge in the inspector and a live checkout shows
 * nothing at all — and the difference only works if the renderer says which
 * happened.
 */
export function resolveDeclarations(
  theme: CheckoutTheme,
  properties: StyleProperties,
  defaults: StyleProperties,
): ResolvedDeclarations {
  const declarations: Record<string, string> = {}
  const fallbacks: StyleFallback[] = []

  for (const [property, raw] of Object.entries(properties)) {
    if (raw === null || typeof raw === "boolean") continue

    const resolved = resolveValue(theme, raw, property)

    if (resolved.ok) {
      declarations[property] = resolved.value
      continue
    }

    fallbacks.push({ property, value: resolved.reference, reason: resolved.reason })

    const fallback = defaults[property]
    if (fallback === null || fallback === undefined || typeof fallback === "boolean") continue

    const resolvedFallback = resolveValue(theme, fallback, property)
    if (resolvedFallback.ok) declarations[property] = resolvedFallback.value
  }

  return { declarations, fallbacks }
}
