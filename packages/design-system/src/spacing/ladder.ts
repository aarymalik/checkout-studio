/**
 * A spacing ladder, derived from one base unit.
 *
 * ## Why a ladder and not twelve numbers
 *
 * A theme stores `spacing.scale` as absolute pixel values, and the renderer
 * emits each one as `--ck-space-N` — it never reads `spacing.base`. So a base
 * unit on its own reaches nothing: it would save, display, and change no pixel
 * on the canvas.
 *
 * It is not a vestigial field, though. The default theme's base is 8 and its
 * scale is `[0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96]`, which is this
 * ladder times that base, exactly. The base is the unit the ladder was
 * designed around; the scale is what the renderer consumes. Deriving one from
 * the other is what makes the base a decision rather than a note, the same way
 * one brand colour stands for eleven.
 *
 * ## The steps
 *
 * Measured from the default theme rather than chosen: dividing its scale by
 * its base gives these multipliers and nothing is left over. A half step for
 * hairline gaps, whole steps through the range a layout actually uses, then
 * widening gaps where the difference between 80 and 88 stops being visible.
 */

export const SPACING_STEPS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12] as const

/**
 * The scale a base unit implies.
 *
 * Rounded to whole pixels. A base of 10 gives a half step of 5, a base of 9
 * gives 4.5, and a fractional pixel in a gap is a blurred edge on a display
 * that cannot draw it — so the ladder lands on pixels and the base is free to
 * be any number.
 */
export function deriveSpacing(base: number): readonly number[] {
  return SPACING_STEPS.map((step) => Math.round(step * base))
}
