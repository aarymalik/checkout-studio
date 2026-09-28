import { describe, expect, it } from "vitest"

import { LAYOUT, clampWidth } from "./shell"
import { primitives } from "../tokens/primitives"

describe("LAYOUT", () => {
  // The numbers and the CSS must come from the same place, or a drag clamps to
  // one value while the stylesheet lays out another.
  it("reads every dimension from the tokens", () => {
    expect(LAYOUT.toolbarHeight).toBe(Number.parseInt(primitives["layout-toolbar"], 10))
    expect(LAYOUT.statusBarHeight).toBe(Number.parseInt(primitives["layout-status-bar"], 10))
    expect(LAYOUT.left.default).toBe(Number.parseInt(primitives["layout-panel-left"], 10))
    expect(LAYOUT.left.min).toBe(Number.parseInt(primitives["layout-panel-left-min"], 10))
    expect(LAYOUT.left.max).toBe(Number.parseInt(primitives["layout-panel-left-max"], 10))
    expect(LAYOUT.right.default).toBe(Number.parseInt(primitives["layout-panel-right"], 10))
    expect(LAYOUT.right.min).toBe(Number.parseInt(primitives["layout-panel-right-min"], 10))
    expect(LAYOUT.right.max).toBe(Number.parseInt(primitives["layout-panel-right-max"], 10))
    expect(LAYOUT.leftCollapsed).toBe(
      Number.parseInt(primitives["layout-panel-left-collapsed"], 10),
    )
  })

  it("keeps each default inside its own range", () => {
    for (const bounds of [LAYOUT.left, LAYOUT.right]) {
      expect(bounds.min).toBeLessThan(bounds.max)
      expect(bounds.default).toBeGreaterThanOrEqual(bounds.min)
      expect(bounds.default).toBeLessThanOrEqual(bounds.max)
    }
  })

  it("collapses the left panel narrower than it can ever be dragged", () => {
    expect(LAYOUT.leftCollapsed).toBeLessThan(LAYOUT.left.min)
  })
})

describe("clampWidth", () => {
  it("leaves a width inside the range alone", () => {
    expect(clampWidth(300, LAYOUT.left)).toBe(300)
  })

  it("stops at the minimum and the maximum", () => {
    expect(clampWidth(0, LAYOUT.left)).toBe(LAYOUT.left.min)
    expect(clampWidth(9_999, LAYOUT.left)).toBe(LAYOUT.left.max)
  })

  it("rounds, because a drag produces fractions and a layout should not", () => {
    expect(clampWidth(300.4, LAYOUT.left)).toBe(300)
    expect(clampWidth(300.6, LAYOUT.left)).toBe(301)
  })

  // A stored preference is data, and data arrives broken. Falling back to the
  // default is the one behaviour that cannot leave a panel unusable.
  it("falls back to the default for a value that is not a number", () => {
    expect(clampWidth(Number.NaN, LAYOUT.right)).toBe(LAYOUT.right.default)
    expect(clampWidth(Number.POSITIVE_INFINITY, LAYOUT.right)).toBe(LAYOUT.right.default)
  })
})
