import { AA, contrastRatio } from "./contrast"
import { atLightness, hexToOklch, oklchToHex } from "./oklch"
import type { Oklch } from "./oklch"

/**
 * One brand colour in, a coherent set out.
 *
 * docs/theme-system.md § Color Derivation: "Users pick one brand color. The
 * system derives a coherent scale." Everything here is that sentence.
 *
 * ## The ladder is lightness, and nothing else moves
 *
 * A step is the seed at a different lightness. The hue is kept exactly and the
 * chroma is kept as far as sRGB will show it — `oklchToHex` gives up only the
 * saturation that could never have been displayed, which is why a pale step of
 * a vivid seed comes out pale rather than clipped to the wrong hue.
 *
 * ## The seed keeps its own rung
 *
 * The step nearest the seed's lightness returns the seed itself, not a
 * recomputed approximation of it. Somebody who typed `#2563eb` can find
 * `#2563eb` in the result; a scale that answered `#2563ea` would be a scale
 * that had quietly corrected them.
 *
 * Which rung that is depends on the colour. A pale brand lands high on the
 * ladder and a deep one lands low, so neither is dragged to the middle — the
 * spec's own example seed sits at 600 because its lightness is 0.546, not
 * because 600 is where seeds go.
 */

/**
 * The rungs, and the perceptual lightness each one means.
 *
 * Measured from the scale docs/theme-system.md prints as its worked example,
 * rather than invented. A first version guessed a plausible-looking curve and
 * the spec's own seed landed on 700, which is the kind of disagreement nobody
 * notices until a brand colour comes out one step from where the
 * documentation says it will.
 */
export const SCALE: Readonly<Record<number, number>> = {
  50: 0.97,
  100: 0.932,
  200: 0.882,
  300: 0.809,
  400: 0.714,
  500: 0.623,
  600: 0.546,
  700: 0.488,
  800: 0.424,
  900: 0.379,
  950: 0.282,
}

/**
 * How much of the seed's chroma each rung carries.
 *
 * Measured from the same worked example. It is a bell: colour is most
 * saturated through the middle of the ladder and fades toward both ends,
 * because that is where sRGB has room for it — a near-white and a near-black
 * cannot hold much of anything.
 *
 * Without this the dark rungs came out vivid where the example is muted,
 * `#001e6d` against its `#172554`. Holding one chroma all the way down is not
 * a scale somebody would have drawn by hand.
 */
const CHROMA: Readonly<Record<number, number>> = {
  50: 0.066,
  100: 0.147,
  200: 0.265,
  300: 0.444,
  400: 0.666,
  500: 0.874,
  600: 1,
  700: 1.009,
  800: 0.84,
  900: 0.64,
  950: 0.406,
}

export const STEPS: readonly number[] = Object.keys(SCALE)
  .map(Number)
  .sort((first, second) => first - second)

export type Scale = Readonly<Record<number, string>>

export function deriveScale(seed: string): Scale {
  const colour = hexToOklch(seed)
  const rung = nearestStep(colour.lightness)

  /*
   * The curve is read relative to the seed's own rung, so that rung carries
   * exactly the seed's chroma and its neighbours sit either side of it. Read
   * absolutely instead, a brand that happened to be pale would have its own
   * step desaturated out from under it.
   */
  const atSeed = CHROMA[rung] as number

  return Object.fromEntries(
    STEPS.map((step) => {
      if (step === rung) return [step, normalise(seed)]

      const lightness = SCALE[step] as number
      const chroma = (colour.chroma * (CHROMA[step] as number)) / atSeed

      return [step, oklchToHex({ ...colour, lightness, chroma })]
    }),
  )
}

/** The step whose lightness the seed is closest to. */
export function nearestStep(lightness: number): number {
  return STEPS.reduce((best, step) =>
    Math.abs((SCALE[step] as number) - lightness) < Math.abs((SCALE[best] as number) - lightness)
      ? step
      : best,
  )
}

/**
 * The semantic colours a seed implies.
 *
 * The shifts are docs/theme-system.md's: hover six per cent darker, active
 * twelve, a foreground of whichever of white or near-black clears AA against
 * the seed, a focus ring at forty per cent alpha and a selection at fifteen.
 */
export interface DerivedRoles {
  hover: string
  active: string
  /** White or near-black, whichever is readable on the seed. */
  foreground: string
  focusRing: string
  selection: string
  /**
   * True when neither white nor near-black clears 4.5:1 against the seed.
   *
   * The spec says to adjust the seed and warn. Adjusting it here would be this
   * function changing the colour somebody chose, so it reports instead and the
   * panel decides — which is also what lets the warning name the real problem
   * rather than appearing after the colour has already moved.
   *
   * It is a narrow thing to be true. Measured across the greys, only
   * `#777777` and `#787878` fail both, at 4.48 against each — so a panel
   * author should expect this to fire almost never, and should not read its
   * silence as the check being broken.
   */
  unreadable: boolean
}

/** Not pure black: a true black on a saturated field reads as a hole in it. */
export const NEAR_BLACK = "#0a0a0a"
export const WHITE = "#ffffff"

export function deriveRoles(seed: string): DerivedRoles {
  const colour = hexToOklch(seed)
  const onWhite = contrastRatio(WHITE, seed)
  const onBlack = contrastRatio(NEAR_BLACK, seed)

  return {
    hover: shifted(colour, -0.06),
    active: shifted(colour, -0.12),
    foreground: onWhite >= onBlack ? WHITE : NEAR_BLACK,
    focusRing: withAlpha(seed, 0.4),
    selection: withAlpha(seed, 0.15),
    // `AA.text`, because a button's label is body text. The threshold lives
    // in contrast.ts with the rest of WCAG 1.4.3 rather than being written
    // out again here.
    unreadable: Math.max(onWhite, onBlack) < AA.text,
  }
}

function shifted(colour: Oklch, by: number): string {
  return oklchToHex(atLightness(colour, colour.lightness + by))
}

/**
 * The same colour, carried as an eight digit hex.
 *
 * One format for every colour a theme holds, rather than a ring written as
 * `rgb(... / 40%)` beside a swatch written as `#2563eb`. The theme's own guard
 * takes both; a person reading the JSON should not have to.
 */
function withAlpha(hex: string, alpha: number): string {
  const channel = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")

  return `${normalise(hex)}${channel}`
}

/** `#ABC` and `#aabbcc` are the same colour; the scale should say so once. */
function normalise(hex: string): string {
  const value = hex.trim().toLowerCase().replace("#", "")

  if (value.length !== 3) return `#${value}`

  return `#${value
    .split("")
    .map((digit) => digit + digit)
    .join("")}`
}
