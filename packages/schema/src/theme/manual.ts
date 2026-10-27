import type { CheckoutTheme } from "./types"

/**
 * Which values a person chose.
 *
 * docs/theme-system.md § Color Derivation: "users may override any derived
 * value. Overrides are marked as manual and are never recomputed." A theme
 * cannot honour that without remembering which values were chosen rather than
 * worked out, because the two are indistinguishable once stored — both are
 * just a colour.
 *
 * Kept as a list of token paths rather than a flag beside each value. The
 * theme's groups are closed, typed objects, so a flag per value would mean
 * widening every one of them from `string` to something carrying provenance,
 * and every reader would then have to unwrap a value to use it. A parallel
 * index costs one field and leaves the values alone.
 *
 * The paths are the same vocabulary as a token reference — `colors.focusRing`
 * is what `{colors.focusRing}` names — so a person reading the JSON does not
 * have to learn a second way of pointing at a theme value.
 *
 * ## What it does not do yet
 *
 * Only the colours write marks, because only the colours have something that
 * would otherwise overwrite them: the Brand section recomputes two roles from
 * the brand colour. The specification also asks that presets never overwrite a
 * value the user has set, which needs every section to mark what it writes —
 * mechanical, and belonging with the presets that would read it rather than
 * ahead of them.
 */

/**
 * A dotted path into a theme, as a reference names one.
 *
 * Deliberately the same shape as the body of `{...}` in validate.ts: a leading
 * group name, then at least one segment under it.
 */
const MANUAL_PATH = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+$/

function isManualPath(value: string): boolean {
  return MANUAL_PATH.test(value)
}

/** @returns true when a person set the value at `path` rather than deriving it. */
export function isManual(theme: CheckoutTheme, path: string): boolean {
  return theme.manual.includes(path)
}

/**
 * The theme with `path` marked as chosen.
 *
 * Sorted and deduplicated, because the list is part of the theme's identity:
 * `canonicalJson` and `equivalent` compare themes structurally, and two themes
 * that mark the same paths in a different order are the same theme. Writing the
 * list in one place is what keeps that true.
 */
export function markManual(theme: CheckoutTheme, path: string): CheckoutTheme {
  if (isManual(theme, path)) return theme

  return { ...theme, manual: [...theme.manual, path].sort() }
}

/** The theme with `path` no longer marked, so whatever derives it may again. */
export function clearManual(theme: CheckoutTheme, path: string): CheckoutTheme {
  if (!isManual(theme, path)) return theme

  return { ...theme, manual: theme.manual.filter((marked) => marked !== path) }
}

/** Every path the theme marks that is not a path into a theme. */
export function unknownManualPaths(theme: CheckoutTheme): readonly string[] {
  return theme.manual.filter((path) => !isManualPath(path) || readsNothing(theme, path))
}

/**
 * Whether a path names nothing in this theme.
 *
 * A mark on a path that resolves to nothing protects nothing, and the value a
 * person thought they had pinned gets recomputed under them. Worth reporting,
 * which is why this is here rather than left for a reader to notice.
 *
 * `components` is excluded: a slot's shape belongs to its plugin, the engine
 * cannot say which keys are legitimate, and a theme may hold a slot for a
 * plugin this installation has not loaded.
 */
function readsNothing(theme: CheckoutTheme, path: string): boolean {
  const [group, ...rest] = path.split(".")

  if (group === "components") return false

  let current: unknown = (theme as unknown as Record<string, unknown>)[group as string]

  for (const segment of rest) {
    if (typeof current !== "object" || current === null) return true

    current = (current as Record<string, unknown>)[segment]
  }

  return current === undefined
}
