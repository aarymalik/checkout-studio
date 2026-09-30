import { describe, expect, it } from "vitest"

import { DEFAULT_THEME_ID, defaultTheme } from "../src/theme/defaults"
import { MAX_INHERITANCE_DEPTH, flatten, mergeDeep } from "../src/theme/inherit"
import { checkoutTheme, fontDefinition, storedTheme } from "../src/theme/types"
import type { StoredTheme } from "../src/theme/types"
import {
  isColor,
  isDuration,
  isEasing,
  isFontFamily,
  isLength,
  isSafeCssValue,
  isShadow,
  validateTheme,
} from "../src/theme/validate"

/** The default theme as a stored layer — the root of any chain in these tests. */
function root(overrides: Partial<StoredTheme> = {}): StoredTheme {
  return storedTheme.parse({ ...defaultTheme, ...overrides })
}

/** A sparse layer. Only what it changes. */
function layer(id: string, values: Record<string, unknown>): StoredTheme {
  return storedTheme.parse({
    id,
    name: id,
    version: "1.0.0",
    metadata: { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ...values,
  })
}

describe("the theme type", () => {
  it("parses the default theme", () => {
    const parsed = checkoutTheme.safeParse(defaultTheme)

    expect(parsed.success).toBe(true)
  })

  it("defaults the component slots and the metadata flags", () => {
    const { components, ...withoutComponents } = defaultTheme
    const { isPreset, tags, ...metadata } = defaultTheme.metadata

    const parsed = checkoutTheme.parse({ ...withoutComponents, metadata })

    expect(components).toEqual({})
    expect(isPreset).toBe(true)
    expect(tags).toEqual(["neutral"])
    expect(parsed.components).toEqual({})
    expect(parsed.metadata.isPreset).toBe(false)
    expect(parsed.metadata.tags).toEqual([])
  })

  it("defaults the custom colours to an empty record", () => {
    const { custom, ...colors } = defaultTheme.colors

    const parsed = checkoutTheme.parse({ ...defaultTheme, colors })

    expect(custom).toEqual({})
    expect(parsed.colors.custom).toEqual({})
  })

  it("rejects an unknown key", () => {
    const parsed = checkoutTheme.safeParse({ ...defaultTheme, mood: "cheerful" })

    expect(parsed.success).toBe(false)
  })

  it("requires a custom font to name its asset", () => {
    const withoutAsset = fontDefinition.safeParse({
      family: "Founders Grotesk",
      source: "custom",
      weights: [400],
      fallback: ["sans-serif"],
    })
    const withAsset = fontDefinition.safeParse({
      family: "Founders Grotesk",
      source: "custom",
      weights: [400],
      assetId: "ast_9f2a",
      fallback: ["sans-serif"],
    })

    expect(withoutAsset.success).toBe(false)
    expect(withAsset.success).toBe(true)
  })

  it("accepts a google or system font without an asset", () => {
    const parsed = fontDefinition.safeParse({
      family: "Inter",
      source: "google",
      weights: [400, 700],
      fallback: ["sans-serif"],
    })

    expect(parsed.success).toBe(true)
  })

  it("keeps its identity stable so the renderer can memoise on it", () => {
    expect(defaultTheme.id).toBe(DEFAULT_THEME_ID)
    expect(defaultTheme.metadata.createdAt).toBe(defaultTheme.metadata.updatedAt)
  })
})

describe("the universal CSS guard", () => {
  it("accepts ordinary values", () => {
    expect(isSafeCssValue("#4f46e5")).toBe(true)
    expect(isSafeCssValue("0 1px 2px rgba(0, 0, 0, 0.4)")).toBe(true)
    expect(isSafeCssValue('"Inter", sans-serif')).toBe(true)
    expect(isSafeCssValue("url(/fonts/inter.woff2)")).toBe(true)
    expect(isSafeCssValue("url(https://cdn.example.com/a.png)")).toBe(true)
    expect(isSafeCssValue('url("//cdn.example.com/a.png")')).toBe(true)
  })

  it("refuses an empty value", () => {
    expect(isSafeCssValue("")).toBe(false)
    expect(isSafeCssValue("   ")).toBe(false)
  })

  it("refuses the structural characters that would end the declaration", () => {
    expect(isSafeCssValue("red; position: fixed")).toBe(false)
    expect(isSafeCssValue("red } body {")).toBe(false)
    expect(isSafeCssValue("red {")).toBe(false)
  })

  it("refuses a backslash, because it can encode anything below", () => {
    // `\6a avascript:` reaches a CSS parser as `javascript:`, so the scan for
    // forbidden sequences has to happen on a string that cannot be re-encoded.
    expect(isSafeCssValue("url(\\6a avascript:alert(1))")).toBe(false)
  })

  it("refuses every payload in the rejection fixture", () => {
    for (const payload of [
      "url(javascript:alert(1))",
      "URL(JavaScript:alert(1))",
      "url(vbscript:msgbox)",
      "expression(alert(1))",
      "@import url(https://evil.example.com/x.css)",
      "behavior: url(#default#time2)",
      "-moz-binding: url(https://evil.example.com/x.xml#xss)",
      "red /* comment */",
      "*/ red",
      "<script>",
      "red > blue",
    ]) {
      expect(isSafeCssValue(payload), payload).toBe(false)
    }
  })

  it("refuses unbalanced parentheses and quotes", () => {
    expect(isSafeCssValue("rgb(0, 0, 0")).toBe(false)
    expect(isSafeCssValue("rgb(0, 0, 0))")).toBe(false)
    expect(isSafeCssValue('"Inter')).toBe(false)
    expect(isSafeCssValue("'Inter")).toBe(false)
  })

  it("ignores parentheses inside quotes", () => {
    expect(isSafeCssValue('"a (b"')).toBe(true)
  })

  it("refuses a url pointing anywhere we do not serve from", () => {
    expect(isSafeCssValue("url(data:text/html,<script>alert(1)</script>)")).toBe(false)
    expect(isSafeCssValue("url(http://insecure.example.com/a.png)")).toBe(false)
    expect(isSafeCssValue("url()")).toBe(false)
  })
})

describe("typed CSS values", () => {
  it("accepts the colour notations the theme system permits", () => {
    for (const value of [
      "#fff",
      "#ffff",
      "#4f46e5",
      "#4f46e5ff",
      "rgb(0 0 0)",
      "rgba(0, 0, 0, 0.4)",
      "hsl(240 80% 50%)",
      "hsla(240, 80%, 50%, 0.5)",
      "oklch(0.7 0.15 250)",
      "oklch(0.7 0.15 250 / 40%)",
      "oklab(0.7 0.1 -0.1)",
      "transparent",
      "currentColor",
    ]) {
      expect(isColor(value), value).toBe(true)
    }
  })

  it("refuses colours it cannot parse component-wise", () => {
    for (const value of [
      "rebeccapurple",
      "#ff",
      "#fffff",
      "var(--ck-color-primary)",
      "color-mix(in oklch, red, blue)",
      "rgb(calc(1 + 1) 0 0)",
      "url(javascript:alert(1))",
    ]) {
      expect(isColor(value), value).toBe(false)
    }
  })

  it("accepts lengths and ratios", () => {
    for (const value of ["0", "16px", "1.5", "-0.02em", "100%", "50vh", "1fr", ".5rem"]) {
      expect(isLength(value), value).toBe(true)
    }
  })

  it("refuses a length with a unit or a function we do not emit", () => {
    for (const value of ["16pt", "calc(100% - 8px)", "auto", "16 px", ""]) {
      expect(isLength(value), value).toBe(false)
    }
  })

  it("accepts durations in ms and s", () => {
    expect(isDuration("180ms")).toBe(true)
    expect(isDuration("0.2s")).toBe(true)
    expect(isDuration("180")).toBe(false)
    expect(isDuration("180 ms")).toBe(false)
    expect(isDuration("url(javascript:alert(1))")).toBe(false)
  })

  it("accepts named easings and a four-number bezier", () => {
    expect(isEasing("ease-out")).toBe(true)
    expect(isEasing("LINEAR")).toBe(true)
    expect(isEasing("cubic-bezier(0.16, 1, 0.3, 1)")).toBe(true)
    expect(isEasing("cubic-bezier(0.16, 1, 0.3)")).toBe(false)
    expect(isEasing("cubic-bezier(0.16, 1, 0.3, 1, 1)")).toBe(false)
    expect(isEasing("cubic-bezier(a, b, c, d)")).toBe(false)
    expect(isEasing("steps(4, end)")).toBe(false)
    expect(isEasing("spring")).toBe(false)
    expect(isEasing("url(javascript:alert(1))")).toBe(false)
  })

  it("parses shadows component-wise", () => {
    for (const value of [
      "none",
      "0 1px 2px rgba(10, 10, 10, 0.06)",
      "0 0",
      "inset 0 1px 0 #fff",
      "0 1px 2px #000, 0 4px 12px rgba(0, 0, 0, 0.2)",
    ]) {
      expect(isShadow(value), value).toBe(true)
    }
  })

  it("refuses a shadow whose parts do not make one", () => {
    for (const value of [
      "0",
      "0 1px 2px 3px 4px #000",
      "0 1px #000 #fff",
      "inset inset 0 1px",
      "0 1px drop-shadow(1px)",
      ", 0 1px 2px #000",
      "url(javascript:alert(1)) 0 1px",
    ]) {
      expect(isShadow(value), value).toBe(false)
    }
  })

  it("accepts family names and generic families", () => {
    expect(isFontFamily("Inter")).toBe(true)
    expect(isFontFamily("JetBrains Mono")).toBe(true)
    expect(isFontFamily("Helvetica Neue")).toBe(true)
    expect(isFontFamily("sans-serif")).toBe(true)
    expect(isFontFamily("ui-monospace")).toBe(true)
  })

  it("refuses a family name that is not one", () => {
    expect(isFontFamily("-vendor-hack")).toBe(false)
    expect(isFontFamily("Inter, sans-serif")).toBe(false)
    expect(isFontFamily("Inter!")).toBe(false)
    expect(isFontFamily("url(javascript:alert(1))")).toBe(false)
  })
})

describe("validating a whole theme", () => {
  it("finds nothing wrong with the default", () => {
    expect(validateTheme(defaultTheme)).toEqual([])
  })

  it("names the path of every bad value", () => {
    const problems = validateTheme({
      ...defaultTheme,
      colors: {
        ...defaultTheme.colors,
        primary: "rebeccapurple",
        custom: { mint: "not-a-colour" },
      },
      typography: {
        ...defaultTheme.typography,
        fontFamily: {
          ...defaultTheme.typography.fontFamily,
          body: {
            family: "Inter, sans-serif",
            source: "system",
            weights: [400],
            fallback: ["-vendor-hack"],
          },
        },
        scale: {
          ...defaultTheme.typography.scale,
          h1: { ...defaultTheme.typography.scale.h1, fontSize: "36pt" },
        },
      },
      radius: { ...defaultTheme.radius, lg: "16 px" },
      shadows: { ...defaultTheme.shadows, md: "0 #000" },
      motion: { ...defaultTheme.motion, durationNormal: "180", easing: "springy" },
    })

    expect(problems.map((problem) => problem.path)).toEqual([
      "colors.primary",
      "colors.custom.mint",
      "typography.fontFamily.body.family",
      "typography.fontFamily.body.fallback.0",
      "typography.scale.h1.fontSize",
      "radius.lg",
      "shadows.md",
      "motion.durationNormal",
      "motion.easing",
    ])
  })

  it("reports the value and the reason, so the inspector can explain itself", () => {
    const [problem] = validateTheme({
      ...defaultTheme,
      motion: { ...defaultTheme.motion, durationFast: "quick" },
    })

    expect(problem).toEqual({
      path: "motion.durationFast",
      value: "quick",
      reason: "Expected a duration.",
    })
  })

  it("catches a bad line height and letter spacing", () => {
    const problems = validateTheme({
      ...defaultTheme,
      typography: {
        ...defaultTheme.typography,
        scale: {
          ...defaultTheme.typography.scale,
          body: {
            ...defaultTheme.typography.scale.body,
            lineHeight: "normal",
            letterSpacing: "wide",
          },
        },
      },
    })

    expect(problems.map((problem) => problem.path)).toEqual([
      "typography.scale.body.lineHeight",
      "typography.scale.body.letterSpacing",
    ])
  })

  it("catches the slow duration", () => {
    const problems = validateTheme({
      ...defaultTheme,
      motion: { ...defaultTheme.motion, durationSlow: "slowly" },
    })

    expect(problems.map((problem) => problem.path)).toEqual(["motion.durationSlow"])
  })

  it("validates the dark layer too", () => {
    const problems = validateTheme({
      ...defaultTheme,
      dark: {
        colors: { surface: "midnight", custom: { mint: "minty" } },
        radius: { lg: "16 px" },
        shadows: { md: "0 #000" },
      },
    })

    expect(problems.map((problem) => problem.path)).toEqual([
      "dark.colors.surface",
      "dark.colors.custom.mint",
      "dark.radius.lg",
      "dark.shadows.md",
    ])
  })

  it("has nothing to say about a theme with no dark layer", () => {
    const { dark, ...light } = defaultTheme

    expect(dark).toBeDefined()
    expect(validateTheme(light)).toEqual([])
  })

  it("has nothing to say about a dark layer with no colours", () => {
    expect(validateTheme({ ...defaultTheme, dark: { motion: { easing: "ease-out" } } })).toEqual([])
  })
})

describe("merging theme layers", () => {
  it("recurses into plain objects", () => {
    expect(mergeDeep({ a: { b: 1, c: 2 } }, { a: { c: 3 } })).toEqual({ a: { b: 1, c: 3 } })
  })

  it("replaces arrays rather than concatenating them", () => {
    // A scale of three steps laid over a scale of five means three steps, not
    // eight. Concatenation would silently produce a scale nobody authored.
    expect(mergeDeep({ scale: [0, 4, 8, 12, 16] }, { scale: [0, 4, 8] })).toEqual({
      scale: [0, 4, 8],
    })
  })

  it("treats undefined in the overlay as absence, not as a value", () => {
    expect(mergeDeep({ a: 1 }, { a: undefined })).toEqual({ a: 1 })
  })

  it("replaces a scalar with an object and an object with a scalar", () => {
    expect(mergeDeep({ a: 1 }, { a: { b: 2 } })).toEqual({ a: { b: 2 } })
    expect(mergeDeep({ a: { b: 2 } }, { a: 1 })).toEqual({ a: 1 })
  })

  it("returns the base when the overlay is not an object at all", () => {
    expect(mergeDeep({ a: 1 }, undefined)).toEqual({ a: 1 })
    expect(mergeDeep({ a: 1 }, "red")).toBe("red")
  })
})

describe("flattening an inheritance chain", () => {
  it("resolves a theme that inherits nothing", () => {
    const result = flatten(DEFAULT_THEME_ID, [root()])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.theme.colors.primary).toBe(defaultTheme.colors.primary)
    expect(result.chain).toEqual([DEFAULT_THEME_ID])
  })

  it("applies the most specific layer last", () => {
    const project = layer("theme_project", {
      extends: DEFAULT_THEME_ID,
      colors: { primary: "#0ea5e9" },
    })
    const page = layer("theme_page", {
      extends: "theme_project",
      colors: { primary: "#f97316" },
    })

    const result = flatten("theme_page", [root(), project, page])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.theme.colors.primary).toBe("#f97316")
    expect(result.chain).toEqual([DEFAULT_THEME_ID, "theme_project", "theme_page"])
  })

  it("inherits everything a layer does not change", () => {
    const project = layer("theme_project", {
      extends: DEFAULT_THEME_ID,
      colors: { primary: "#0ea5e9" },
    })

    const result = flatten("theme_project", [root(), project])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.theme.colors.primary).toBe("#0ea5e9")
    expect(result.theme.colors.surface).toBe(defaultTheme.colors.surface)
    expect(result.theme.typography.scale.h1).toEqual(defaultTheme.typography.scale.h1)
  })

  it("keeps the requested theme's identity, not the root's", () => {
    const project = layer("theme_project", { extends: DEFAULT_THEME_ID, version: "2.3.1" })

    const result = flatten("theme_project", [root(), project])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The id and version are the renderer's memoisation key, and a published
    // snapshot has to say which theme it came from.
    expect(result.theme.id).toBe("theme_project")
    expect(result.theme.name).toBe("theme_project")
    expect(result.theme.version).toBe("2.3.1")
  })

  it("drops `extends` from the flat result, which no longer inherits", () => {
    const project = layer("theme_project", { extends: DEFAULT_THEME_ID })

    const result = flatten("theme_project", [root(), project])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect("extends" in result.theme).toBe(false)
  })

  it("reports a missing theme", () => {
    expect(flatten("theme_nowhere", [root()])).toEqual({
      ok: false,
      code: "missing-parent",
      themeId: "theme_nowhere",
      chain: [],
    })
  })

  it("reports a missing parent, naming the parent and what it got through", () => {
    const orphan = layer("theme_orphan", { extends: "theme_gone" })

    expect(flatten("theme_orphan", [orphan])).toEqual({
      ok: false,
      code: "missing-parent",
      themeId: "theme_gone",
      chain: ["theme_orphan"],
    })
  })

  it("rejects a cycle", () => {
    const a = layer("theme_a", { extends: "theme_b" })
    const b = layer("theme_b", { extends: "theme_a" })

    expect(flatten("theme_a", [a, b])).toEqual({
      ok: false,
      code: "cycle",
      themeId: "theme_a",
      chain: ["theme_a", "theme_b"],
    })
  })

  it("rejects a theme that extends itself", () => {
    const self = layer("theme_self", { extends: "theme_self" })

    expect(flatten("theme_self", [self])).toEqual({
      ok: false,
      code: "cycle",
      themeId: "theme_self",
      chain: ["theme_self"],
    })
  })

  it("rejects a chain deeper than four", () => {
    const themes = [
      root(),
      layer("t1", { extends: DEFAULT_THEME_ID }),
      layer("t2", { extends: "t1" }),
      layer("t3", { extends: "t2" }),
      layer("t4", { extends: "t3" }),
    ]

    const deep = flatten("t4", themes)
    const permitted = flatten("t3", themes)

    expect(deep).toEqual({
      ok: false,
      code: "too-deep",
      themeId: DEFAULT_THEME_ID,
      chain: ["t4", "t3", "t2", "t1", DEFAULT_THEME_ID],
    })
    expect(permitted.ok).toBe(true)
    expect(MAX_INHERITANCE_DEPTH).toBe(4)
  })

  it("refuses a chain whose root left a value unset", () => {
    const incomplete = flatten("theme_alone", [
      layer("theme_alone", { colors: { primary: "#fff" } }),
    ])

    expect(incomplete.ok).toBe(false)
    if (incomplete.ok) return
    expect(incomplete.code).toBe("incomplete")
    expect(incomplete.themeId).toBe("theme_alone")
    expect(incomplete.problems).toContain("colors.primaryForeground")
  })

  it("accepts an iterable, so a database cursor needs no array", () => {
    const themes = new Map([[DEFAULT_THEME_ID, root()]])

    expect(flatten(DEFAULT_THEME_ID, themes.values()).ok).toBe(true)
  })
})
