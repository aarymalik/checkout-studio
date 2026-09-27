import { describe, expect, it } from "vitest"
import { primitives } from "@checkout-studio/design-system"
import { BRAND, GLYPH, INK, MUTED, PAPER } from "./colors"

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
    ["BRAND", BRAND, "blue-600"],
    ["GLYPH", GLYPH, "gray-0"],
    ["INK", INK, "gray-950"],
    ["PAPER", PAPER, "gray-50"],
    ["MUTED", MUTED, "gray-400"],
  ])("%s is the palette's %s", (_, value, token) => {
    expect(value).toBe(primitives[token as keyof typeof primitives])
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
