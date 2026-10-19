/**
 * A length, split into the number somebody types and the unit they pick.
 *
 * ## Tokens are not lengths
 *
 * Most style values in this product are token references — a grid's default
 * gap is `{spacing.5}`. Parsing one as a number gives `NaN`, and writing the
 * result back would replace a reference to the design system with a literal
 * nobody chose. So a reference is recognised and left alone; the control shows
 * it and refuses to edit it until there is a token picker to change it with.
 *
 * ## The track list a column count means
 *
 * `columns` stores `repeat(3, minmax(0, 1fr))` and the control shows `3`. The
 * SDK's own note on the control says why: a count is what somebody laying out
 * a page is thinking about, and `minmax(0, 1fr)` rather than `1fr` because a
 * bare `1fr` floors at its content's minimum size and one long word pushes the
 * rest off the page.
 *
 * The shape is written out here rather than imported: it belongs to the
 * control, which is the editor's, and the editor may not import the plugin
 * that happens to also write it.
 */

export interface Length {
  amount: number
  unit: string
}

const LENGTH = /^(-?\d*\.?\d+)([a-z%]*)$/i

export function parseLength(value: unknown): Length | null {
  if (typeof value === "number" && Number.isFinite(value)) return { amount: value, unit: "" }
  if (typeof value !== "string") return null

  const match = LENGTH.exec(value.trim())

  if (match === null) return null

  const amount = Number(match[1])

  return Number.isFinite(amount) ? { amount, unit: match[2] ?? "" } : null
}

/**
 * The values that sit where a unit sits and take no number.
 *
 * `margin: auto` and `max-width: none` are lengths in every sense that matters
 * to a person laying out a page — they belong in the unit picker, because that
 * is where somebody looks for "and now stop capping it". Written as `0auto` or
 * `0none` they are not values at all and the declaration is dropped in
 * silence, which is why `formatLength` has to know about them.
 *
 * Only `auto` was handled before, as a special case in that function. A
 * Section ships `max-width: none`, so the one value the component itself
 * chooses fell straight through the control.
 */
export const KEYWORD_UNITS: readonly string[] = [
  "auto",
  "none",
  "fit-content",
  "max-content",
  "min-content",
]

export function isKeywordUnit(unit: string): boolean {
  return KEYWORD_UNITS.includes(unit)
}

/** The keyword a value is, if it is exactly one of them. */
export function keywordLength(value: unknown): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()

  return isKeywordUnit(trimmed) ? trimmed : null
}

export function formatLength(amount: number, unit: string): string {
  if (isKeywordUnit(unit)) return unit

  return `${String(amount)}${unit}`
}

const TRACKS = /^repeat\((\d+),/

export function columnTracks(count: number): string {
  return `repeat(${String(count)}, minmax(0, 1fr))`
}

export function parseColumns(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value !== "string") return null

  const match = TRACKS.exec(value.trim())

  if (match === null) return null

  const count = Number(match[1])

  return Number.isInteger(count) && count > 0 ? count : null
}
