import { describe, expect, it } from "vitest"

import { TYPE_RATIOS, TYPE_STEPS_ASCENDING, deriveTypeScale } from "./scale"

/**
 * The ladder is a measurement. What these hold is that it stays one — and that
 * the reason it is a ladder rather than a ratio stays true of it.
 *
 * The assertion against `defaultTheme` itself lives in the Studio panel's
 * tests, because the schema sits on this package's layer and neither may
 * import the other.
 */

describe("the ladder", () => {
  it("is the default theme's own sizes at its own body size", () => {
    expect(deriveTypeScale(16)).toEqual({
      display: 48,
      h1: 36,
      h2: 30,
      h3: 24,
      h4: 20,
      bodyLarge: 18,
      body: 16,
      small: 14,
      caption: 13,
    })
  })

  it("leaves the base size where it was put", () => {
    // `body` is the base. A ladder that moved it would make the control a
    // suggestion rather than a setting.
    expect(deriveTypeScale(18).body).toBe(18)
    expect(deriveTypeScale(13).body).toBe(13)
  })

  it("is not geometric, which is the whole reason it is a table", () => {
    /*
     * If one ratio could describe it, a ratio control would be the better
     * design. The ratios between consecutive steps run from about 1.08 to
     * about 1.33, so none can.
     */
    const rungs = TYPE_STEPS_ASCENDING.map((step) => TYPE_RATIOS[step])
    const ratios = rungs.slice(1).map((value, index) => value / (rungs[index] ?? 1))

    expect(Math.min(...ratios)).toBeLessThan(1.1)
    expect(Math.max(...ratios)).toBeGreaterThan(1.3)
  })
})

describe("the order of it", () => {
  it("never puts a step below the one under it, at any base", () => {
    for (const base of [8, 11, 13, 14, 16, 18, 21, 24]) {
      const scale = deriveTypeScale(base)

      for (let index = 1; index < TYPE_STEPS_ASCENDING.length; index += 1) {
        const under = scale[TYPE_STEPS_ASCENDING[index - 1] as never]
        const over = scale[TYPE_STEPS_ASCENDING[index] as never]

        expect(over).toBeGreaterThanOrEqual(under)
      }
    }
  })

  it("holds every step the ladder names", () => {
    expect(Object.keys(TYPE_RATIOS).sort()).toEqual([...TYPE_STEPS_ASCENDING].sort())
  })
})
