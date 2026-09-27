import { describe, expect, it } from "vitest"
import { primitives } from "@checkout-studio/design-system"
import { BRAND, BRAND_ACCENT, BRAND_MID, GLYPH, INK, MUTED, PAPER } from "./colors"

/**
 * The five literal colours, held to the palette.
 *
 * They exist because the token system cannot reach where they are read — a PNG
 * rendered outside a browser, a theme colour handed to an operating system
 * before any stylesheet. That is a good reason to write a value down and no
 * reason at all for it to be a different value.
 *
 * Without this, changing the brand blue in the palette would leave the favicon,
 * the home-screen icon and every link preview on the old one, and nothing would
 * say so.
 */
describe("the literal colours", () => {
  it.each([
    ["BRAND", BRAND, "indigo-600"],
    ["GLYPH", GLYPH, "gray-0"],
    ["INK", INK, "gray-950"],
    ["PAPER", PAPER, "gray-50"],
    ["MUTED", MUTED, "gray-400"],
  ])("%s is the palette's %s", (_, value, token) => {
    expect(value).toBe(primitives[token as keyof typeof primitives])
  })

  it("keeps the gradient's midpoint between its ends", () => {
    /*
     * The rendered icons use a solid sample where a browser would show the
     * gradient continuing. If the ends move and the sample does not, the PNGs
     * quietly stop matching the SVG.
     */
    const channels = (hex: string): [number, number, number] => [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ]

    const [fromRed, fromGreen, fromBlue] = channels(BRAND)
    const [midRed, midGreen, midBlue] = channels(BRAND_MID)
    const [toRed, toGreen, toBlue] = channels(BRAND_ACCENT)

    // Within one, because the midpoint of two odd numbers rounds either way.
    expect(Math.abs(midRed - (fromRed + toRed) / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(midGreen - (fromGreen + toGreen) / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(midBlue - (fromBlue + toBlue) / 2)).toBeLessThanOrEqual(1)
  })

  it("keeps violet out of the interface palette", () => {
    // The mark is allowed a colour of its own. The palette is not: colour in
    // the interface is reserved for actions.
    expect(Object.values(primitives)).not.toContain(BRAND_ACCENT)
  })

  it("matches what the favicon is drawn with", async () => {
    // The SVG is a static file, so it cannot import anything. A test is the
    // only thing standing between it and the rest of the brand.
    //
    // Read from the package root rather than from import.meta.url: under the
    // jsdom environment that is not a file URL, and readFileSync says so.
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const svg = readFileSync(resolve(process.cwd(), "src/app/icon.svg"), "utf8")

    expect(svg).toContain(BRAND)
    expect(svg).toContain(GLYPH)
  })
})
