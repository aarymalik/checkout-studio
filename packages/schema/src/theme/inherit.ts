import { checkoutTheme } from "./types"
import type { CheckoutTheme, StoredTheme } from "./types"

/**
 * Theme inheritance.
 *
 * ```
 * Platform Preset  →  Project Theme  →  Page Theme Override  →  node styles
 * ```
 *
 * Resolved once, at load, into a flat effective theme. The renderer never walks
 * a chain — it receives the flat result. That is not an optimisation so much as
 * a correctness property: a renderer that resolved inheritance per node would
 * produce a different answer depending on when it was asked.
 *
 * See docs/theme-system.md § Theme Inheritance.
 */

/** Platform preset → organization → project → page. A fifth tier is a design smell. */
export const MAX_INHERITANCE_DEPTH = 4

export type InheritErrorCode =
  /** A theme in the chain names a parent that does not exist. */
  | "missing-parent"
  /** The chain returns to a theme it has already visited. */
  | "cycle"
  /** The chain is longer than four themes. */
  | "too-deep"
  /** The chain's root left a required value unset, so the flat theme is incomplete. */
  | "incomplete"

export interface InheritFailure {
  ok: false
  code: InheritErrorCode
  /** The theme at which resolution stopped. */
  themeId: string
  /** Every id visited, from the requested theme upward. */
  chain: readonly string[]
  /** Present on `incomplete`: the paths the flat theme is missing or has wrong. */
  problems?: readonly string[]
}

export interface InheritSuccess {
  ok: true
  theme: CheckoutTheme
  /** Every id merged, root first — the order the values were applied in. */
  chain: readonly string[]
}

export type InheritResult = InheritSuccess | InheritFailure

type Plain = Record<string, unknown>

function isPlainObject(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Merges `overlay` onto `base`, recursing into plain objects.
 *
 * Arrays replace rather than concatenate. A spacing scale of `[0, 4, 8]` laid
 * over `[0, 4, 8, 12, 16]` means "three steps", not "five steps, the first
 * three of which I have restated" — and concatenation would silently produce
 * eight. Same reasoning for a font's weight list.
 *
 * `undefined` in the overlay is absence, not a value: a sparse theme omits what
 * it does not change, and `{ colors: undefined }` must not erase the parent's
 * colours.
 */
export function mergeDeep<T>(base: T, overlay: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return (overlay === undefined ? base : overlay) as T
  }

  const merged: Plain = { ...base }

  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue
    merged[key] =
      isPlainObject(value) && isPlainObject(merged[key]) ? mergeDeep(merged[key], value) : value
  }

  return merged as T
}

/** The themes from `themeId` up to its root, or a failure if the walk cannot finish. */
function walkUp(
  themeId: string,
  themes: ReadonlyMap<string, StoredTheme>,
): { ok: true; requested: StoredTheme; layers: StoredTheme[] } | InheritFailure {
  const layers: StoredTheme[] = []
  const seen = new Set<string>([themeId])

  const requested = themes.get(themeId)
  if (requested === undefined) {
    return { ok: false, code: "missing-parent", themeId, chain: [] }
  }

  layers.push(requested)
  let current = requested.extends

  while (current !== undefined) {
    const chain = layers.map((layer) => layer.id)

    if (seen.has(current)) {
      return { ok: false, code: "cycle", themeId: current, chain }
    }

    const theme = themes.get(current)
    if (theme === undefined) {
      return { ok: false, code: "missing-parent", themeId: current, chain }
    }

    seen.add(current)
    layers.push(theme)

    if (layers.length > MAX_INHERITANCE_DEPTH) {
      return { ok: false, code: "too-deep", themeId: current, chain: [...chain, current] }
    }

    current = theme.extends
  }

  return { ok: true, requested, layers }
}

/**
 * Flattens an inheritance chain into one complete theme.
 *
 * @param themeId the theme to resolve — the most specific one, not the root
 * @param themes every theme that might appear in the chain, by id
 */
export function flatten(themeId: string, themes: Iterable<StoredTheme>): InheritResult {
  const byId = new Map<string, StoredTheme>()
  for (const theme of themes) byId.set(theme.id, theme)

  const walk = walkUp(themeId, byId)
  if (!walk.ok) return walk

  // Root first: the most specific theme's values must be applied last.
  const applied = [...walk.layers].reverse()

  let merged: unknown = {}
  for (const layer of applied) merged = mergeDeep(merged, layer)

  // The flat theme keeps the requested theme's identity, not the root's. A
  // published page's snapshot has to say which theme it came from, and the id
  // and version are also the renderer's memoisation key.
  const candidate: Plain = {
    ...(merged as Plain),
    id: walk.requested.id,
    name: walk.requested.name,
    version: walk.requested.version,
  }
  delete candidate["extends"]

  const parsed = checkoutTheme.safeParse(candidate)
  if (!parsed.success) {
    return {
      ok: false,
      code: "incomplete",
      themeId,
      chain: applied.map((layer) => layer.id),
      problems: parsed.error.issues.map((issue) => issue.path.join(".")),
    }
  }

  return { ok: true, theme: parsed.data, chain: applied.map((layer) => layer.id) }
}
