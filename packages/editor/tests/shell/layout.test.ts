import { describe, expect, it } from "vitest"
import { LAYOUT } from "@checkout-studio/design-system"

import { DEFAULT_LAYOUT, SIDEBAR_TABS, layoutsEqual, normalizeLayout } from "../../src/shell/layout"

describe("DEFAULT_LAYOUT", () => {
  it("opens both panels at their designed widths", () => {
    expect(DEFAULT_LAYOUT).toEqual({
      leftWidth: LAYOUT.left.default,
      rightWidth: LAYOUT.right.default,
      leftCollapsed: false,
      rightCollapsed: false,
      sidebarTab: "components",
    })
  })

  it("starts on a tab that exists", () => {
    expect(SIDEBAR_TABS).toContain(DEFAULT_LAYOUT.sidebarTab)
  })
})

describe("normalizeLayout", () => {
  it("restores a layout it recognises", () => {
    const stored = {
      leftWidth: 300,
      rightWidth: 400,
      leftCollapsed: true,
      rightCollapsed: false,
      sidebarTab: "layers",
    }

    expect(normalizeLayout(stored)).toEqual(stored)
  })

  it("clamps a width that is outside the panel's range", () => {
    const layout = normalizeLayout({ leftWidth: 10_000, rightWidth: 1 })

    expect(layout.leftWidth).toBe(LAYOUT.left.max)
    expect(layout.rightWidth).toBe(LAYOUT.right.min)
  })

  // A row written by an older version of the product is the ordinary case.
  it("fills in what a partial layout does not say", () => {
    expect(normalizeLayout({ leftCollapsed: true })).toEqual({
      ...DEFAULT_LAYOUT,
      leftCollapsed: true,
    })
  })

  it("falls back for a field of the wrong type", () => {
    const layout = normalizeLayout({
      leftWidth: "320",
      leftCollapsed: "yes",
      sidebarTab: "nonsense",
    })

    expect(layout.leftWidth).toBe(LAYOUT.left.default)
    expect(layout.leftCollapsed).toBe(false)
    expect(layout.sidebarTab).toBe(DEFAULT_LAYOUT.sidebarTab)
  })

  it.each([[null], [undefined], ["{}"], [42], [[]]])(
    "falls back entirely for %p",
    (value: unknown) => {
      expect(normalizeLayout(value)).toEqual(DEFAULT_LAYOUT)
    },
  )
})

describe("layoutsEqual", () => {
  it("recognises an unchanged layout, so nothing is written back", () => {
    expect(layoutsEqual(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT })).toBe(true)
  })

  it.each([
    ["leftWidth", { leftWidth: 300 }],
    ["rightWidth", { rightWidth: 400 }],
    ["leftCollapsed", { leftCollapsed: true }],
    ["rightCollapsed", { rightCollapsed: true }],
    ["sidebarTab", { sidebarTab: "layers" as const }],
  ])("notices a change to %s", (_field, change) => {
    expect(layoutsEqual(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT, ...change })).toBe(false)
  })
})
