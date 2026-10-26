import { describe, expect, it } from "vitest"

import { SPACING_STEPS, deriveSpacing } from "./ladder"

/**
 * The ladder is a measurement, not a preference. What these hold is that it
 * stays one: the default theme's own scale divided by its own base.
 *
 * The assertion against `defaultTheme` itself lives in the Studio panel's
 * tests, because the schema package sits on this one's layer and neither may
 * import the other.
 */

describe("the ladder", () => {
  it("is the default theme's scale at the default theme's base", () => {
    expect(deriveSpacing(8)).toEqual([0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96])
  })

  it("starts at nothing, because a gap of zero is a gap a layout asks for", () => {
    expect(deriveSpacing(8)[0]).toBe(0)
  })

  it("holds as many steps as it has multipliers", () => {
    expect(deriveSpacing(13)).toHaveLength(SPACING_STEPS.length)
  })
})

describe("a base that does not divide cleanly", () => {
  it("lands on whole pixels, because half a pixel is a blurred edge", () => {
    // 9 × 0.5 is 4.5, and 9 × 1.5 is 13.5.
    expect(deriveSpacing(9)).toEqual([0, 5, 9, 14, 18, 27, 36, 45, 54, 72, 90, 108])
  })

  it("never rounds a step past the one above it", () => {
    for (const base of [1, 3, 7, 9, 11, 17, 23]) {
      const scale = deriveSpacing(base)

      for (let index = 1; index < scale.length; index += 1) {
        expect(scale[index] ?? 0).toBeGreaterThanOrEqual(scale[index - 1] ?? 0)
      }
    }
  })
})
