import { describe, expect, it } from "vitest"
import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"

import { mergeTheme } from "./theme"
import type { ThemeMergeInput } from "./theme"

/**
 * Whose design wins when a page arrives from somewhere else.
 *
 * Four strategies and one thing they all have to get right: which theme id
 * the project's other pages are left pointing at. A strategy that mints a new
 * id where it should not have splits a project in two, and nobody notices
 * until the pages stop matching.
 */

const NOW = new Date("2026-11-14T09:00:00.000Z")

function theme(over: Partial<CheckoutTheme> = {}): CheckoutTheme {
  return {
    ...defaultTheme,
    metadata: { ...defaultTheme.metadata, createdAt: "2020-01-01T00:00:00.000Z" },
    ...over,
  }
}

const TARGET = theme({
  id: "theme_target",
  name: "Our brand",
  colors: { ...defaultTheme.colors, primary: "#111111" },
})

const BUNDLE = theme({
  id: "theme_bundle",
  name: "Spring sale",
  colors: { ...defaultTheme.colors, primary: "#ff0000", custom: { mint: "#00ffaa" } },
  radius: { ...defaultTheme.radius, lg: "24px" },
})

function input(over: Partial<ThemeMergeInput> = {}): ThemeMergeInput {
  return {
    strategy: "keep-target",
    bundle: BUNDLE,
    target: TARGET,
    freshThemeId: "theme_fresh",
    now: NOW,
    ...over,
  }
}

describe("keeping the project's theme", () => {
  it("writes nothing and points the page at what was already here", () => {
    // The default for a template install: it adopts the project's theme,
    // which is what makes it look like it belongs.
    expect(mergeTheme(input())).toEqual({ write: null, themeId: "theme_target" })
  })
})

describe("applying the bundle's theme", () => {
  it("takes the bundle's design", () => {
    const { write } = mergeTheme(input({ strategy: "apply-bundle" }))

    expect(write?.theme.colors.primary).toBe("#ff0000")
    expect(write?.theme.name).toBe("Spring sale")
    expect(write?.as).toBe("replace")
  })

  it("keeps the project's theme id, so the other pages come with it", () => {
    /*
     * Every page in the project references this theme by id. Taking the
     * bundle's id would leave them pointing at a theme that does not exist
     * here and quietly split the project in two.
     */
    const result = mergeTheme(input({ strategy: "apply-bundle" }))

    expect(result.themeId).toBe("theme_target")
    expect(result.write?.theme.id).toBe("theme_target")
  })

  it("keeps the date the project's theme was created", () => {
    // Replacing a theme does not create one.
    const { write } = mergeTheme(input({ strategy: "apply-bundle" }))

    expect(write?.theme.metadata.createdAt).toBe("2020-01-01T00:00:00.000Z")
    expect(write?.theme.metadata.updatedAt).toBe("2026-11-14T09:00:00.000Z")
  })
})

describe("adding only what is missing", () => {
  it("leaves a value the project has already decided", () => {
    const { write } = mergeTheme(input({ strategy: "merge-additive" }))

    expect(write?.theme.colors.primary).toBe("#111111")
  })

  it("takes a value the project does not have", () => {
    const { write } = mergeTheme(input({ strategy: "merge-additive" }))

    expect(write?.theme.colors.custom).toEqual({ mint: "#00ffaa" })
  })

  it("is not apply-bundle with extra steps", () => {
    /*
     * The order is the whole strategy: the bundle underneath and the project
     * on top. Reversed, every token the project had chosen would be
     * overwritten, which is a different strategy that already exists.
     *
     * `radius.lg` is the case worth naming. The bundle sets 24px and the
     * project never touched it — but a project theme is complete, so it
     * holds the default rather than a gap, and a default is still a value
     * the project has. "Missing" means absent, not unremarkable.
     */
    const { write } = mergeTheme(input({ strategy: "merge-additive" }))

    expect(write?.theme.radius.lg).toBe(TARGET.radius.lg)
    expect(write?.theme.radius.lg).not.toBe("24px")
    expect(write?.theme.name).toBe("Our brand")
  })

  it("keeps the project's id and its creation date", () => {
    const result = mergeTheme(input({ strategy: "merge-additive" }))

    expect(result.themeId).toBe("theme_target")
    expect(result.write?.theme.metadata.createdAt).toBe("2020-01-01T00:00:00.000Z")
  })
})

describe("importing it as a theme of its own", () => {
  it("writes a new theme and points only the imported page at it", () => {
    // The point is a second theme beside the first, so the project's other
    // pages are untouched.
    const result = mergeTheme(input({ strategy: "namespace" }))

    expect(result).toMatchObject({ themeId: "theme_fresh" })
    expect(result.write?.as).toBe("new")
    expect(result.write?.theme.id).toBe("theme_fresh")
  })

  it("keeps the bundle's design and its name", () => {
    const { write } = mergeTheme(input({ strategy: "namespace" }))

    expect(write?.theme.colors.primary).toBe("#ff0000")
    expect(write?.theme.name).toBe("Spring sale")
  })

  it("is created now, because it is new here", () => {
    const { write } = mergeTheme(input({ strategy: "namespace" }))

    expect(write?.theme.metadata.createdAt).toBe("2026-11-14T09:00:00.000Z")
  })
})

describe("a bundle with no theme at all", () => {
  it.each(["apply-bundle", "merge-additive", "namespace"] as const)(
    "falls back to keeping the project's, under %s",
    (strategy) => {
      /*
       * A page bundle need not carry a theme. "Apply the bundle's theme" with
       * nothing to apply is a request that cannot be honoured rather than an
       * error: the page still imports, and it looks like the project it
       * landed in.
       */
      expect(mergeTheme(input({ strategy, bundle: null }))).toEqual({
        write: null,
        themeId: "theme_target",
      })
    },
  )
})
