import { describe, expect, it } from "vitest"

import { pixels } from "./pixels"

/**
 * The parser three sections share.
 *
 * It exists because the obvious way to read a length is wrong in a way that
 * does not look wrong: `Number.parseFloat` reads a unit it does not understand
 * as the end of the number and returns what came before it.
 */

describe("a length in pixels", () => {
  it("reads whole pixels", () => {
    expect(pixels("16px")).toBe(16)
  })

  it("reads fractional pixels, because a theme may hold one", () => {
    expect(pixels("0.5px")).toBe(0.5)
  })

  it("reads a bare zero, which is how CSS and the default theme write it", () => {
    expect(pixels("0")).toBe(0)
  })

  it("ignores the space around it", () => {
    expect(pixels("  24px  ")).toBe(24)
  })
})

describe("a length written any other way", () => {
  it("refuses rem, which parseFloat would have read as a number of pixels", () => {
    /*
     * The bug this was written for. `Number.parseFloat("1rem")` is 1, so a
     * body size of `1rem` became a one-pixel base and derived the whole type
     * scale from it — a slider showing 1 beside text at 16px.
     */
    expect(pixels("1rem")).toBeNull()
  })

  it("refuses the other relative units", () => {
    for (const value of ["1em", "2ex", "1ch", "5vw", "10vh", "50%"]) {
      expect(pixels(value)).toBeNull()
    }
  })

  it("refuses a keyword", () => {
    expect(pixels("inherit")).toBeNull()
    expect(pixels("none")).toBeNull()
  })

  it("refuses a calculation, because its value depends on the box", () => {
    expect(pixels("calc(1rem + 2px)")).toBeNull()
  })

  it("refuses a negative length, which no caller of this has a use for", () => {
    // A radius, a blur and a font size are all non-negative. A shadow's offset
    // can be negative, and the section that reads one shows it as written
    // rather than putting it on a slider that starts at zero.
    expect(pixels("-4px")).toBeNull()
  })

  it("refuses nothing at all", () => {
    expect(pixels("")).toBeNull()
    expect(pixels("   ")).toBeNull()
  })
})
