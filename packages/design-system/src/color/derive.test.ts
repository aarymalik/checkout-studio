import { describe, expect, it } from "vitest"

import { contrastRatio, hexToHsl, parseHex } from "./contrast"
import { NEAR_BLACK, SCALE, STEPS, WHITE, deriveRoles, deriveScale, nearestStep } from "./derive"
import { hexToOklch } from "./oklch"

/**
 * Deriving a palette from one brand colour.
 *
 * These assert properties rather than hexes, almost everywhere. A ladder of
 * eleven exact strings is a test that fails when somebody improves the
 * lightness curve by a hundredth, which teaches people to update the numbers
 * without reading them. What must stay true is that the steps run light to
 * dark, that the hue never wanders, and that the seed survives.
 */

const SEED = "#2563eb"

describe("why this is not HSL", () => {
  it("gives the same lightness to colours that look the same", () => {
    /*
     * The whole reason for the conversion. HSL calls every one of these "50%
     * light": a vivid yellow and a navy that is nearly black. A ladder built
     * on that comes out even for blues and wrong for yellows, which is the
     * one failure a derived palette must not have.
     */
    const hsl = ["#ffff00", "#0000ff"].map((hex) => hexToHsl(hex).lightness / 100)
    const oklch = ["#ffff00", "#0000ff"].map((hex) => hexToOklch(hex).lightness)

    expect(hsl[0]).toBeCloseTo(hsl[1] as number, 2)
    expect((oklch[0] as number) - (oklch[1] as number)).toBeGreaterThan(0.4)
  })
})

describe("the scale", () => {
  it("has a rung for every step", () => {
    expect(Object.keys(deriveScale(SEED)).map(Number)).toEqual(STEPS)
  })

  it("runs light to dark", () => {
    const scale = deriveScale(SEED)
    const lightness = STEPS.map((step) => hexToOklch(scale[step] as string).lightness)

    for (let at = 1; at < lightness.length; at += 1) {
      expect(lightness[at]).toBeLessThan(lightness[at - 1] as number)
    }
  })

  it("keeps the hue it was given", () => {
    // A scale that drifts in hue is a scale of several colours.
    const scale = deriveScale(SEED)
    const hue = hexToOklch(SEED).hue

    for (const step of STEPS) {
      const stepHue = hexToOklch(scale[step] as string).hue

      // The lightest and darkest rungs are nearly grey, and a hue read off a
      // near-grey is noise — so those are allowed to wander.
      if (hexToOklch(scale[step] as string).chroma < 0.02) continue

      expect(Math.abs(stepHue - hue)).toBeLessThan(2)
    }
  })

  it("returns the seed itself, not an approximation of it", () => {
    /*
     * Somebody who typed `#2563eb` can find `#2563eb` in the result. A scale
     * answering `#2563ea` would be one that had quietly corrected them.
     */
    const scale = deriveScale(SEED)

    expect(Object.values(scale)).toContain(SEED)
  })

  it("puts the seed on the rung its own lightness belongs to", () => {
    /*
     * Not always 600. The spec's example lands there because the ladder was
     * measured from that example, and a pale brand should stay pale rather
     * than being dragged to the middle of it.
     */
    expect(deriveScale(SEED)[600]).toBe(SEED)
    expect(deriveScale("#eff6ff")[50]).toBe("#eff6ff")
    expect(deriveScale("#172554")[950]).toBe("#172554")
  })

  it("reproduces the scale the specification prints", () => {
    /*
     * docs/theme-system.md § Color Derivation shows a worked example: this
     * seed, and the eleven colours it should produce. Both the lightness
     * ladder and the chroma curve were measured from it, so this is the test
     * that says the measuring was done right — and the one that fails if
     * either is changed without looking at what it does to the example.
     *
     * Close rather than identical. The example's hue wanders by a degree or
     * two between steps and this derivation holds it exactly, so matching to
     * the byte would mean reproducing someone else's rounding.
     */
    const example: Readonly<Record<number, string>> = {
      50: "#eff6ff",
      100: "#dbeafe",
      200: "#bfdbfe",
      300: "#93c5fd",
      400: "#60a5fa",
      500: "#3b82f6",
      600: "#2563eb",
      700: "#1d4ed8",
      800: "#1e40af",
      900: "#1e3a8a",
      950: "#172554",
    }

    const derived = deriveScale(SEED)

    for (const step of STEPS) {
      const theirs = parseHex(example[step] as string)
      const ours = parseHex(derived[step] as string)
      const worst = Math.max(
        ...theirs.map((channel, at) => Math.abs(channel - (ours[at] as number))),
      )

      expect(worst, `step ${String(step)}`).toBeLessThanOrEqual(20)
    }
  })

  it("normalises a short hex, so the seed is findable", () => {
    expect(Object.values(deriveScale("#07F"))).toContain("#0077ff")
  })

  it("derives a usable scale from black and from white", () => {
    // Neither has a hue, and a ladder of eleven identical greys would be a
    // scale that had given up rather than one that is wrong.
    for (const seed of ["#000000", "#ffffff"]) {
      const scale = deriveScale(seed)

      expect(new Set(Object.values(scale)).size).toBeGreaterThan(5)
    }
  })
})

describe("the step a lightness belongs to", () => {
  it.each(STEPS)("round trips step %i", (step) => {
    expect(nearestStep(SCALE[step] as number)).toBe(step)
  })

  it("takes the nearer of two", () => {
    const between = ((SCALE[600] as number) + (SCALE[700] as number)) / 2

    expect(nearestStep(between + 0.01)).toBe(600)
    expect(nearestStep(between - 0.01)).toBe(700)
  })
})

describe("the roles a seed implies", () => {
  it("darkens for hover and darkens further for active", () => {
    const roles = deriveRoles(SEED)
    const seed = hexToOklch(SEED).lightness

    expect(hexToOklch(roles.hover).lightness).toBeLessThan(seed)
    expect(hexToOklch(roles.active).lightness).toBeLessThan(hexToOklch(roles.hover).lightness)
  })

  it("picks a foreground that can actually be read", () => {
    // Which is the whole job: a label nobody can read on a brand colour is a
    // button that fails WCAG on every checkout it appears on.
    for (const seed of [SEED, "#ffff00", "#000000", "#7f7f7f"]) {
      const roles = deriveRoles(seed)

      expect([WHITE, NEAR_BLACK]).toContain(roles.foreground)
      expect(contrastRatio(roles.foreground, seed)).toBeGreaterThanOrEqual(
        contrastRatio(roles.foreground === WHITE ? NEAR_BLACK : WHITE, seed),
      )
    }
  })

  it("says when neither white nor black is readable, rather than choosing anyway", () => {
    /*
     * The spec says to adjust the seed and warn. Adjusting it here would be
     * this function changing the colour somebody chose, so it reports and the
     * panel decides — which also lets the warning name the real problem.
     */
    /*
     * `#777777` is one of exactly two greys that fail both — 4.48 against
     * white and 4.42 against near-black. The band is that narrow, which is
     * worth knowing: a panel author should not read this check's silence as
     * it being broken.
     */
    expect(deriveRoles("#777777").unreadable).toBe(true)
    expect(deriveRoles(SEED).unreadable).toBe(false)
  })

  it("carries alpha as an eight digit hex, which the theme already accepts", () => {
    const roles = deriveRoles(SEED)

    expect(roles.focusRing).toBe("#2563eb66")
    expect(roles.selection).toBe("#2563eb26")
  })
})
