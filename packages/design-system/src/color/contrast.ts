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
