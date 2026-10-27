import { describe, expect, it } from "vitest"

import {
  checkoutTheme,
  clearManual,
  defaultTheme,
  flatten,
  isManual,
  markManual,
  storedTheme,
  unknownManualPaths,
} from "../src/theme"
import type { CheckoutTheme, StoredTheme } from "../src/theme"

/**
 * Which theme values a person chose.
 *
 * The specification's rule is one sentence — "overrides are marked as manual
 * and are never recomputed" — and the thing that can quietly break it is not
 * the marking but the carrying: a mark that does not survive a save, a flatten
 * or a round trip through the database protects nothing, and nobody finds out
 * until a brand colour moves a value somebody had pinned.
 */

describe("marking a value as chosen", () => {
  it("marks nothing by default", () => {
    expect(defaultTheme.manual).toEqual([])
    expect(isManual(defaultTheme, "colors.focusRing")).toBe(false)
  })

  it("marks a path", () => {
    const marked = markManual(defaultTheme, "colors.focusRing")

    expect(isManual(marked, "colors.focusRing")).toBe(true)
    expect(marked.manual).toEqual(["colors.focusRing"])
  })

  it("leaves the rest of the theme alone", () => {
    const marked = markManual(defaultTheme, "colors.focusRing")

    expect(marked.colors).toEqual(defaultTheme.colors)
    expect(marked.radius).toEqual(defaultTheme.radius)
  })

  it("marks a path once, however often it is asked", () => {
    const twice = markManual(markManual(defaultTheme, "colors.focusRing"), "colors.focusRing")

    expect(twice.manual).toEqual(["colors.focusRing"])
  })

  it("returns the same theme when the path is already marked", () => {
    const once = markManual(defaultTheme, "colors.focusRing")

    // Identity, not just equality: an edit that changes nothing should not
    // make the panel think the theme has moved.
    expect(markManual(once, "colors.focusRing")).toBe(once)
  })

  it("keeps the list sorted, so two themes marking the same paths are equal", () => {
    const one = markManual(markManual(defaultTheme, "radius.md"), "colors.focusRing")
    const other = markManual(markManual(defaultTheme, "colors.focusRing"), "radius.md")

    expect(one.manual).toEqual(other.manual)
    expect(JSON.stringify(one)).toBe(JSON.stringify(other))
  })

  it("unmarks a path", () => {
    const marked = markManual(defaultTheme, "colors.focusRing")

    expect(clearManual(marked, "colors.focusRing").manual).toEqual([])
  })

  it("unmarks only the path it was given", () => {
    const marked = markManual(markManual(defaultTheme, "colors.focusRing"), "colors.border")

    expect(clearManual(marked, "colors.border").manual).toEqual(["colors.focusRing"])
  })

  it("returns the same theme when the path was never marked", () => {
    expect(clearManual(defaultTheme, "colors.focusRing")).toBe(defaultTheme)
  })
})

describe("a mark that protects nothing", () => {
  it("finds nothing wrong with the default theme", () => {
    expect(unknownManualPaths(defaultTheme)).toEqual([])
  })

  it("accepts every group a theme holds", () => {
    const marked: CheckoutTheme = {
      ...defaultTheme,
      manual: ["colors.focusRing", "radius.md", "shadows.lg", "motion.easing"],
    }

    expect(unknownManualPaths(marked)).toEqual([])
  })

  it("reports a path that names nothing", () => {
    const marked: CheckoutTheme = { ...defaultTheme, manual: ["colors.nope"] }

    // A mark on a value that is not there leaves the value a person thought
    // they had pinned free to be recomputed under them.
    expect(unknownManualPaths(marked)).toEqual(["colors.nope"])
  })

  it("reports a path that reads through something that is not an object", () => {
    const marked: CheckoutTheme = { ...defaultTheme, manual: ["colors.focusRing.deeper"] }

    expect(unknownManualPaths(marked)).toEqual(["colors.focusRing.deeper"])
  })

  it("accepts a deep path into a group", () => {
    const marked: CheckoutTheme = {
      ...defaultTheme,
      manual: ["typography.scale.body.fontSize", "typography.fontFamily.heading.family"],
    }

    expect(unknownManualPaths(marked)).toEqual([])
  })

  it("reports a bare group, which names no value", () => {
    const marked: CheckoutTheme = { ...defaultTheme, manual: ["colors"] }

    expect(unknownManualPaths(marked)).toEqual(["colors"])
  })

  it("reports the shapes a token reference also refuses", () => {
    // The same vocabulary as `{colors.focusRing}`, so a person does not have
    // to learn a second way of pointing at a theme value.
    const marked: CheckoutTheme = {
      ...defaultTheme,
      manual: ["{colors.focusRing}", "Colors.focusRing", "colors..focusRing"],
    }

    expect(unknownManualPaths(marked)).toEqual([
      "{colors.focusRing}",
      "Colors.focusRing",
      "colors..focusRing",
    ])
  })

  it("says nothing about a component slot, whose keys belong to its plugin", () => {
    const marked: CheckoutTheme = {
      ...defaultTheme,
      manual: ["components.core-container.maxWidth"],
    }

    // The engine has no way to know which keys a slot legitimately holds, and
    // a theme may carry a slot for a plugin this installation never loaded.
    expect(unknownManualPaths(marked)).toEqual([])
  })
})

describe("carrying the marks", () => {
  it("survives a theme parse", () => {
    const parsed = checkoutTheme.safeParse({ ...defaultTheme, manual: ["colors.focusRing"] })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.manual).toEqual(["colors.focusRing"])
  })

  it("defaults to nothing marked for a theme written before the field existed", () => {
    const { manual: _absent, ...older } = defaultTheme
    const parsed = checkoutTheme.safeParse(older)

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.manual).toEqual([])
  })

  it("survives the stored shape, which is strict", () => {
    // The hazard worth a test of its own: a theme is written through
    // `checkoutTheme` and read back through `storedTheme`, so a key only one
    // of them names is a theme that silently fails to parse on the way out.
    const parsed = storedTheme.safeParse({ ...defaultTheme, manual: ["colors.focusRing"] })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.manual).toEqual(["colors.focusRing"])
  })

  it("survives flattening a chain", () => {
    const root = { ...defaultTheme, manual: ["colors.focusRing"] } as unknown as StoredTheme
    const result = flatten(defaultTheme.id, [root])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.theme.manual).toEqual(["colors.focusRing"])
  })

  it("lets a child's marks replace its parent's rather than merging them", () => {
    const parent = {
      ...defaultTheme,
      id: "theme_parent",
      manual: ["colors.focusRing"],
    } as unknown as StoredTheme
    const child = {
      id: "theme_child",
      name: "Child",
      version: defaultTheme.version,
      extends: "theme_parent",
      metadata: defaultTheme.metadata,
      manual: ["colors.border"],
    } as unknown as StoredTheme

    const result = flatten("theme_child", [parent, child])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // A mark says a person chose a value in *this* theme. A preset's marks are
    // not the project's, so the nearer theme's list stands rather than being
    // added to the one above it.
    expect(result.theme.manual).toEqual(["colors.border"])
  })
})
