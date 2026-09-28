import { describe, expect, it } from "vitest"

import {
  allowedWhileOverlayOpen,
  depthOf,
  hasOverlay,
  isOverlay,
  resolveActiveScopes,
} from "../../src/keyboard/scopes"

describe("depthOf", () => {
  it("ranks a child deeper than its parent", () => {
    expect(depthOf("canvas.selection")).toBeGreaterThan(depthOf("canvas"))
    expect(depthOf("canvas.multi-selection")).toBeGreaterThan(depthOf("canvas.selection"))
    expect(depthOf("canvas")).toBeGreaterThan(depthOf("studio"))
    expect(depthOf("studio")).toBeGreaterThan(depthOf("global"))
  })

  it("puts every overlay above everything else", () => {
    expect(depthOf("overlay.dialog")).toBeGreaterThan(depthOf("canvas.multi-selection"))
  })
})

describe("isOverlay", () => {
  it("recognises overlays by their scope name", () => {
    expect(isOverlay("overlay.command-palette")).toBe(true)
    expect(isOverlay("canvas")).toBe(false)
  })
})

describe("resolveActiveScopes", () => {
  it("orders scopes most specific first", () => {
    expect(resolveActiveScopes(["global", "canvas.selection", "studio", "canvas"])).toEqual([
      "canvas.selection",
      "canvas",
      "studio",
      "global",
    ])
  })

  it("collapses a scope declared twice", () => {
    expect(resolveActiveScopes(["canvas", "canvas", "global"])).toEqual(["canvas", "global"])
  })

  // This is what makes a dialog modal in the way a person expects: while it is
  // open, ⌘D does not duplicate something behind it.
  it("excludes everything but overlays while an overlay is open", () => {
    expect(
      resolveActiveScopes(["global", "studio", "canvas.selection", "overlay.command-palette"]),
    ).toEqual(["overlay.command-palette"])
  })

  it("keeps several overlays when several are open", () => {
    const resolved = resolveActiveScopes(["canvas", "overlay.dialog", "overlay.context-menu"])

    expect(resolved).toHaveLength(2)
    expect(resolved).toContain("overlay.dialog")
    expect(resolved).toContain("overlay.context-menu")
  })

  it("returns nothing when nothing is active", () => {
    expect(resolveActiveScopes([])).toEqual([])
  })
})

describe("allowedWhileOverlayOpen", () => {
  it("passes the keys that operate the overlay itself", () => {
    for (const key of ["Escape", "Tab", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
      expect(allowedWhileOverlayOpen(key)).toBe(true)
  })

  it("swallows everything else", () => {
    for (const key of ["KeyD", "Backspace", "Space", "Slash"])
      expect(allowedWhileOverlayOpen(key)).toBe(false)
  })
})

describe("hasOverlay", () => {
  it("answers whether any overlay is open", () => {
    expect(hasOverlay(["canvas", "overlay.dialog"])).toBe(true)
    expect(hasOverlay(["canvas", "global"])).toBe(false)
    expect(hasOverlay([])).toBe(false)
  })
})
