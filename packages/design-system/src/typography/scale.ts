/**
 * A type scale, derived from one base size.
 *
 * ## Why a ladder and not a ratio
 *
 * A modular scale is the usual answer: pick a ratio, raise it to a power per
 * step. It was the wrong answer here, and the default theme is what says so.
 * Its sizes run 13, 14, 16, 18, 20, 24, 30, 36, 48, and the ratios between
 * consecutive steps are 1.08, 1.14, 1.13, 1.11, 1.20, 1.25, 1.20, 1.33 — not
 * one ratio, and not close to one.
 *
 * That is not a flaw in the default. Small sizes need to stay apart to be
 * distinguishable and large ones can jump without looking disjointed, so a
 * hand-tuned ladder beats a geometric one. But it means a ratio control could
 * not reproduce the scale it was handed: the first drag would rewrite all nine
 * sizes into a shape nobody chose.
 *
 * So the ladder is fixed and the base size scales it, the same way the spacing
 * base scales its own ladder.
 *
 * ## The steps
 *
 * Measured, not chosen: the default theme's sizes divided by its body size,
 * which is 16. Every one lands on a sixteenth exactly.
 */

/**
 * Each step as a multiple of the base.
 *
 * Keyed by the step names in `TYPE_SCALE_STEPS`, which lives in the schema —
 * on this package's own layer, so it cannot be imported here. The keys are
 * repeated rather than derived, and a Studio test holds them to the schema's
 * list so a tenth step cannot appear in one and not the other.
 */
export const TYPE_RATIOS = {
  display: 3,
  h1: 2.25,
  h2: 1.875,
  h3: 1.5,
  h4: 1.25,
  bodyLarge: 1.125,
  body: 1,
  small: 0.875,
  caption: 0.8125,
} as const

export type TypeRatioStep = keyof typeof TYPE_RATIOS

/** The steps smallest first, which is the order a scale is read in. */
export const TYPE_STEPS_ASCENDING = [
  "caption",
  "small",
  "body",
  "bodyLarge",
  "h4",
  "h3",
  "h2",
  "h1",
  "display",
] as const satisfies readonly TypeRatioStep[]

/**
 * The size each step takes at a given base, in pixels.
 *
 * Rounded to whole pixels. A base of 17 puts caption on 13.8125, and a browser
 * will render that happily — but the scale is read as a set of sizes a person
 * chose, and `13.8125px` is not one anybody chooses.
 */
export function deriveTypeScale(base: number): Record<TypeRatioStep, number> {
  const sizes = {} as Record<TypeRatioStep, number>

  for (const [step, ratio] of Object.entries(TYPE_RATIOS)) {
    sizes[step as TypeRatioStep] = Math.round(ratio * base)
  }

  return sizes
}
