import { parseHex } from "./contrast"

/**
 * OKLCH, because lightness has to mean the same thing at every hue.
 *
 * ## Why not HSL
 *
 * HSL is already here and would have been free. Its lightness is a number
 * about the sRGB cube rather than about what an eye sees: `hsl(60 100% 50%)`
 * is a vivid yellow and `hsl(240 100% 50%)` is a navy so dark it is nearly
 * black, and both claim fifty per cent. A scale built on it comes out even
 * for blues and wrong for yellows, which is exactly the failure a derived
 * palette must not have — docs/theme-system.md says so in those words:
 * derivation operates in a perceptually uniform space "so lightness steps look
 * even across hues".
 *
 * ## The shape of it
 *
 * Lightness runs 0 to 1. Chroma starts at 0 and has no fixed ceiling — sRGB
 * can hold about 0.37 at its most saturated, and less at the light and dark
 * ends. Hue is degrees around the wheel.
 *
 * ## Conversions
 *
 * sRGB → linear → LMS → OKLab → OKLCH and back, with Björn Ottosson's
 * matrices. They are written out as numbers because that is what they are;
 * naming the coefficients would suggest they could be derived from something
 * here, and they cannot.
 */

export interface Oklch {
  /** 0 is black, 1 is white. Perceptual, so 0.5 looks half-lit at every hue. */
  lightness: number
  /** 0 is grey. sRGB tops out near 0.37, and far lower at the extremes of L. */
  chroma: number
  /** Degrees. 0 is pink-red, 120 green, 240 blue. */
  hue: number
}

export function hexToOklch(hex: string): Oklch {
  const [red, green, blue] = parseHex(hex).map(toLinear) as [number, number, number]

  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)

  const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short

  const hue = (Math.atan2(b, a) * 180) / Math.PI

  return {
    lightness,
    chroma: Math.sqrt(a * a + b * b),
    hue: hue < 0 ? hue + 360 : hue,
  }
}

/**
 * Back to a hex, dragged into the sRGB gamut if it is outside it.
 *
 * Most of OKLCH is not displayable: a lightness of 0.95 cannot hold the chroma
 * of a mid-tone, and asking for it anyway gives channel values past 1 that
 * clip to a colour of the wrong hue. So chroma is reduced until the colour
 * fits, which keeps the hue and the lightness that were asked for and gives up
 * only the saturation that could never have been shown.
 */
export function oklchToHex(colour: Oklch): string {
  const hue = ((colour.hue % 360) + 360) % 360
  const lightness = clamp(colour.lightness, 0, 1)

  let low = 0
  let high = Math.max(colour.chroma, 0)

  if (displayable({ lightness, chroma: high, hue })) return toHex({ lightness, chroma: high, hue })

  // Eight halvings put the error under 0.002 of chroma, which is far below
  // what a byte of each channel can express anyway.
  for (let step = 0; step < 8; step += 1) {
    const middle = (low + high) / 2

    if (displayable({ lightness, chroma: middle, hue })) low = middle
    else high = middle
  }

  return toHex({ lightness, chroma: low, hue })
}

/** The same colour at a different lightness, which is what a scale is made of. */
export function atLightness(colour: Oklch, lightness: number): Oklch {
  return { ...colour, lightness: clamp(lightness, 0, 1) }
}

function channels(colour: Oklch): readonly [number, number, number] {
  const radians = (colour.hue * Math.PI) / 180
  const a = colour.chroma * Math.cos(radians)
  const b = colour.chroma * Math.sin(radians)

  const long = (colour.lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const medium = (colour.lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const short = (colour.lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ]
}

/** Whether every channel lands inside sRGB, with a hair of tolerance for rounding. */
function displayable(colour: Oklch): boolean {
  return channels(colour).every((channel) => channel >= -0.0001 && channel <= 1.0001)
}

function toHex(colour: Oklch): string {
  const hex = channels(colour)
    .map((channel) => Math.round(clamp(toSrgb(channel), 0, 1) * 255))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")

  return `#${hex}`
}

/** sRGB's transfer function, which is not a plain gamma near black. */
function toLinear(channel: number): number {
  const value = channel / 255

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function toSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}
