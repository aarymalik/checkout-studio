import { describe, expect, it } from "vitest"
import { hexToHsl, hslToHex, isHexColor, normalizeHex, roundHsl } from "../src/color/contrast"
import { primitives } from "../src/tokens/primitives"

describe("hex and HSL", () => {
  it("round-trips every colour in the palette", () => {
    // The conversion is only useful if it is lossless: a picker that shifts a
    // colour slightly every time it opens is worse than no picker.
    const colors = Object.entries(primitives)
      .filter(([, value]) => value.startsWith("#"))
      .map(([, value]) => value)

    expect(colors.length).toBeGreaterThan(40)

    for (const color of colors) {
      expect(hslToHex(hexToHsl(color))).toBe(color)
    }
  })

  it("reads the primaries", () => {
    expect(roundHsl(hexToHsl("#ff0000"))).toEqual({ hue: 0, saturation: 100, lightness: 50 })
    expect(roundHsl(hexToHsl("#00ff00"))).toEqual({ hue: 120, saturation: 100, lightness: 50 })
    expect(roundHsl(hexToHsl("#0000ff"))).toEqual({ hue: 240, saturation: 100, lightness: 50 })
  })

  it("keeps the precision a round trip needs", () => {
    // Rounding here would make #eff6ff come back as #f0f6ff, so a picker would
    // shift a colour slightly every time it was opened.
    const { hue } = hexToHsl("#eff6ff")

    expect(Number.isInteger(hue)).toBe(false)
    expect(roundHsl({ hue, saturation: 0, lightness: 0 }).hue).toBe(214)
  })

  it("reports no hue for a grey, because it has none", () => {
    expect(roundHsl(hexToHsl("#808080"))).toEqual({ hue: 0, saturation: 0, lightness: 50 })
    expect(roundHsl(hexToHsl("#ffffff"))).toEqual({ hue: 0, saturation: 0, lightness: 100 })
    expect(roundHsl(hexToHsl("#000000"))).toEqual({ hue: 0, saturation: 0, lightness: 0 })
  })

  it("wraps a hue past the circle rather than clamping it", () => {
    // Dragging a hue slider past 360 should come back to red, not stop at
    // magenta.
    expect(hslToHex({ hue: 360, saturation: 100, lightness: 50 })).toBe("#ff0000")
    expect(hslToHex({ hue: 480, saturation: 100, lightness: 50 })).toBe(
      hslToHex({ hue: 120, saturation: 100, lightness: 50 }),
    )
    expect(hslToHex({ hue: -120, saturation: 100, lightness: 50 })).toBe(
      hslToHex({ hue: 240, saturation: 100, lightness: 50 }),
    )
  })

  it("clamps saturation and lightness, which do not wrap", () => {
    expect(hslToHex({ hue: 0, saturation: 200, lightness: 50 })).toBe("#ff0000")
    expect(hslToHex({ hue: 0, saturation: 100, lightness: 200 })).toBe("#ffffff")
    expect(hslToHex({ hue: 0, saturation: 100, lightness: -50 })).toBe("#000000")
  })

  it("covers every sixth of the colour circle", () => {
    const hues = [30, 90, 150, 210, 270, 330]

    for (const hue of hues) {
      expect(roundHsl(hexToHsl(hslToHex({ hue, saturation: 100, lightness: 50 }))).hue).toBe(hue)
    }
  })
})

describe("reading a colour a reader typed", () => {
  it("accepts the forms people actually type", () => {
    expect(isHexColor("#ffffff")).toBe(true)
    expect(isHexColor("ffffff")).toBe(true)
    expect(isHexColor("#FFF")).toBe(true)
    expect(isHexColor("  #2563eb  ")).toBe(true)
  })

  it("rejects what it cannot read", () => {
    expect(isHexColor("#ff")).toBe(false)
    expect(isHexColor("rebeccapurple")).toBe(false)
    expect(isHexColor("#gggggg")).toBe(false)
    expect(isHexColor("")).toBe(false)
  })

  it("normalises to one form, so two spellings of a colour compare equal", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff")
    expect(normalizeHex("fff")).toBe("#ffffff")
    expect(normalizeHex("#2563EB")).toBe("#2563eb")
  })
})
