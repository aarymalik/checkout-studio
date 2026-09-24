import { describe, expect, it } from "vitest"
import { AA, contrastRatio, contrastRatioRounded } from "../src/color/contrast"
import { CONTRAST_PAIRINGS } from "../src/tokens/semantics"
import { resolveColor } from "../src/tokens/resolve"
import type { Contrast, Mode } from "../src/tokens/resolve"

const SETTINGS: ReadonlyArray<readonly [Mode, Contrast]> = [
  ["light", "normal"],
  ["dark", "normal"],
  ["light", "high"],
  ["dark", "high"],
]

describe("contrast maths", () => {
  it("measures the extremes", () => {
    expect(contrastRatioRounded("#ffffff", "#000000")).toBe(21)
    expect(contrastRatioRounded("#ffffff", "#ffffff")).toBe(1)
  })

  it("is symmetric, because contrast is a property of a pair", () => {
    expect(contrastRatio("#2563eb", "#ffffff")).toBe(contrastRatio("#ffffff", "#2563eb"))
  })

  it("expands three-digit hex", () => {
    expect(contrastRatio("#fff", "#000")).toBe(contrastRatio("#ffffff", "#000000"))
  })

  it("refuses anything that is not a colour", () => {
    expect(() => contrastRatio("rebeccapurple", "#fff")).toThrow(/Not a hex colour/)
  })
})

describe("every declared pairing meets WCAG AA", () => {
  for (const [mode, contrast] of SETTINGS) {
    it(`${mode}, ${contrast} contrast`, () => {
      const failures: string[] = []

      for (const pairing of CONTRAST_PAIRINGS) {
        const foreground = resolveColor(pairing.foreground, mode, contrast)
        const background = resolveColor(pairing.background, mode, contrast)

        // A translucent token has no single colour to measure: what it looks
        // like depends on what is behind it.
        if (foreground === null || background === null) continue

        const required =
          "nonText" in pairing && pairing.nonText
            ? AA.nonText
            : "large" in pairing && pairing.large
              ? AA.largeText
              : AA.text

        const ratio = contrastRatioRounded(foreground, background)

        if (ratio < required) {
          failures.push(
            `${pairing.foreground} on ${pairing.background}: ${ratio}:1, needs ${required}:1`,
          )
        }
      }

      expect(failures).toEqual([])
    })
  }
})

describe("high contrast", () => {
  it("raises contrast rather than lowering it", () => {
    for (const mode of ["light", "dark"] as const) {
      const normal = contrastRatio(
        resolveColor("color-foreground-muted", mode, "normal") as string,
        resolveColor("color-surface", mode, "normal") as string,
      )
      const high = contrastRatio(
        resolveColor("color-foreground-muted", mode, "high") as string,
        resolveColor("color-surface", mode, "high") as string,
      )

      expect(high).toBeGreaterThan(normal)
    }
  })
})
