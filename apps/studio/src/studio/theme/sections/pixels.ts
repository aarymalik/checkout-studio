/**
 * A CSS length read as a number of pixels, or null.
 *
 * The theme stores lengths as strings, so a radius may be `0.5rem`, a shadow's
 * blur `1em` and a body size `1rem`. None of those belongs on a pixel slider,
 * and the usual way of finding out is wrong: `Number.parseFloat("1rem")` is
 * `1`, not `NaN`. A body size of `1rem` read that way becomes a one-pixel base
 * that derives the whole type scale from nothing.
 *
 * So the unit is matched rather than discarded. `0` is accepted without one,
 * because that is how CSS and the default theme both write it.
 *
 * A section applies its own range on top of this. Out of range is not the same
 * as unparseable, and both are shown as the text they are rather than clamped
 * onto a scale they do not sit on.
 */
export function pixels(value: string): number | null {
  const trimmed = value.trim()

  if (trimmed === "0") return 0

  const match = /^(\d+(?:\.\d+)?)px$/.exec(trimmed)
  const amount = match?.[1]

  return amount === undefined ? null : Number(amount)
}
