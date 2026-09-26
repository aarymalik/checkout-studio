/**
 * WCAG contrast measurement.
 *
 * Contrast is the one design property that cannot be judged by eye, so it is
 * computed here and asserted in tests over every pairing the product renders
 * (docs/theme-system.md § Contrast Validation).
 *
 * The maths is WCAG 2.1's relative luminance in sRGB. Deliberately not OKLCH:
 * the accessibility thresholds the product is held to are defined against this
 * formula, and a perceptually nicer number that fails an audit is worth less
 * than the number the audit uses.
 */

/** AA thresholds, from WCAG 2.1 success criteria 1.4.3 and 1.4.11. */
export const AA = {
  /** Body text below 18px. */
  text: 4.5,
  /** Text at 18px and above, or 14px bold. */
  largeText: 3,
  /** Borders, icons and other non-text indicators. */
  nonText: 3,
} as const

/** Parses `#rgb` and `#rrggbb` into channel values in 0…255. */
export function parseHex(hex: string): readonly [number, number, number] {
  const value = hex.trim().replace(/^#/, "")

  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : value

  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    throw new Error(`Not a hex colour: ${hex}`)
  }

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ]
}

/** Undoes the sRGB transfer function for one channel. */
function linearize(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

/** Relative luminance, 0 for black and 1 for white. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHex(hex)
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)
}

/** Contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)

  return (lighter + 0.05) / (darker + 0.05)
}

/** Rounded to two decimals, for readable test output and reports. */
export function contrastRatioRounded(foreground: string, background: string): number {
  return Math.round(contrastRatio(foreground, background) * 100) / 100
}

/**
 * Hue, saturation and lightness — the way people reason about a colour.
 *
 * Hue in degrees, saturation and lightness as percentages. A colour picker
 * built on hex alone asks the reader to do arithmetic; built on HSL, "a bit
 * lighter" is one number moving in one direction.
 */
export interface Hsl {
  hue: number
  saturation: number
  lightness: number
}

/*
 * These conversions keep full precision.
 *
 * Rounding to integers here loses information — #eff6ff comes back as #f0f6ff
 * — so a picker that read a colour into sliders and wrote it back would shift
 * it slightly every time it opened. Rounding is a display decision, made where
 * a number is shown.
 */

/** Converts a hex colour to HSL. */
export function hexToHsl(hex: string): Hsl {
  const [red, green, blue] = parseHex(hex).map((channel) => channel / 255) as [
    number,
    number,
    number,
  ]

  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const span = max - min
  const lightness = (max + min) / 2

  if (span === 0) {
    // A grey has no hue to report. Zero is the convention, not a measurement.
    return { hue: 0, saturation: 0, lightness: lightness * 100 }
  }

  const saturation = span / (1 - Math.abs(2 * lightness - 1))

  const hue =
    max === red
      ? ((green - blue) / span + (green < blue ? 6 : 0)) * 60
      : max === green
        ? ((blue - red) / span + 2) * 60
        : ((red - green) / span + 4) * 60

  return { hue, saturation: saturation * 100, lightness: lightness * 100 }
}

/** Converts HSL back to a hex colour. Out-of-range values are clamped. */
export function hslToHex({ hue, saturation, lightness }: Hsl): string {
  const h = ((hue % 360) + 360) % 360
  const s = clamp(saturation, 0, 100) / 100
  const l = clamp(lightness, 0, 100) / 100

  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const offset = l - chroma / 2

  const [red, green, blue] =
    h < 60
      ? [chroma, secondary, 0]
      : h < 120
        ? [secondary, chroma, 0]
        : h < 180
          ? [0, chroma, secondary]
          : h < 240
            ? [0, secondary, chroma]
            : h < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]

  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + offset) * 255))
    .map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, "0"))
    .join("")}`
}

/** Whether a string is a colour this system can read. */
export function isHexColor(value: string): boolean {
  return /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

/** Normalises `fff`, `#FFF` and `#ffffff` to `#ffffff`. */
export function normalizeHex(value: string): string {
  const [red, green, blue] = parseHex(value)
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

/** Rounds each channel for display. The model keeps its precision. */
export function roundHsl({ hue, saturation, lightness }: Hsl): Hsl {
  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation),
    lightness: Math.round(lightness),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
