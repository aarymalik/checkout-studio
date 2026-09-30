import { defaultTheme } from "@checkout-studio/schema"
import { beforeEach, describe, expect, it } from "vitest"

import { clearThemeCache, compileTheme } from "../src/theme/compile"
import { ROOT_CLASS, readToken, tokenPaths, variableFor } from "../src/theme/variables"
import { theme } from "./support"

beforeEach(() => {
  clearThemeCache()
})

/** The contents of one media query, without whatever follows it. */
function mediaBlock(css: string, maxWidth: number): string {
  const start = css.indexOf(`@media (max-width: ${maxWidth}px) {`)
  const end = css.indexOf("\n}\n", start)

  return css.slice(start, end)
}

describe("token paths and variables", () => {
  it("names a variable for every kind of token", () => {
    expect(variableFor("colors.primary")).toBe("--ck-color-primary")
    expect(variableFor("colors.primaryForeground")).toBe("--ck-color-primary-foreground")
    expect(variableFor("colors.custom.mint")).toBe("--ck-color-custom-mint")
    expect(variableFor("typography.fontFamily.heading")).toBe("--ck-font-heading")
    expect(variableFor("typography.scale.h1.fontSize")).toBe("--ck-text-h1-size")
    expect(variableFor("typography.scale.h1.lineHeight")).toBe("--ck-text-h1-leading")
    expect(variableFor("typography.scale.h1.letterSpacing")).toBe("--ck-text-h1-tracking")
    expect(variableFor("typography.scale.h1.fontWeight")).toBe("--ck-text-h1-weight")
    expect(variableFor("typography.scale.h1.textTransform")).toBe("--ck-text-h1-transform")
    expect(variableFor("typography.scale.bodyLarge.fontSize")).toBe("--ck-text-body-large-size")
    expect(variableFor("spacing.6")).toBe("--ck-space-6")
    expect(variableFor("radius.lg")).toBe("--ck-radius-lg")
    expect(variableFor("shadows.md")).toBe("--ck-shadow-md")
    expect(variableFor("motion.durationNormal")).toBe("--ck-duration-normal")
    expect(variableFor("motion.durationFast")).toBe("--ck-duration-fast")
    expect(variableFor("motion.durationSlow")).toBe("--ck-duration-slow")
    expect(variableFor("motion.easing")).toBe("--ck-easing")
  })

  it("refuses a path that names nothing", () => {
    // An unresolvable reference has to be *detectable*. Translating any string
    // would turn `{colors.primry}` into `var(--ck-color-primry)` and an
    // invisible element with no error anywhere.
    for (const path of [
      "",
      "colors",
      "mood.cheerful",
      "colors.primary.dark",
      "colors.customary.mint",
      "typography.scale.h1",
      "typography.scale.h1.fontStyle",
      "typography.weight.bold",
      "typography.fontFamily.heading.family",
      "spacing.base",
      "spacing.6.x",
      "radius.lg.x",
      "motion.speed",
      "motion.easing.x",
    ]) {
      expect(variableFor(path), path).toBeNull()
    }
  })

  it("enumerates every path the theme offers", () => {
    const paths = tokenPaths(theme)

    expect(paths).toContain("colors.primary")
    expect(paths).toContain("typography.scale.caption.fontSize")
    expect(paths).toContain(`spacing.${theme.spacing.scale.length - 1}`)
    expect(paths).toContain("motion.easing")
    expect(paths).not.toContain("colors.custom")
    // Every path it names must translate, or the enumeration and the naming
    // have drifted and some token would compile to nothing.
    for (const path of paths) expect(variableFor(path), path).not.toBeNull()
  })

  it("enumerates custom colours and an optional type-style field", () => {
    const withExtras = {
      ...theme,
      colors: { ...theme.colors, custom: { mint: "#10b981" } },
      typography: {
        ...theme.typography,
        scale: {
          ...theme.typography.scale,
          h1: { ...theme.typography.scale.h1, textTransform: "uppercase" as const },
        },
      },
    }

    const paths = tokenPaths(withExtras)

    expect(paths).toContain("colors.custom.mint")
    expect(paths).toContain("typography.scale.h1.textTransform")
    expect(tokenPaths(theme)).not.toContain("typography.scale.h1.textTransform")
  })

  it("reads a value at a path", () => {
    expect(readToken(theme, "colors.primary")).toBe(theme.colors.primary)
    expect(readToken(theme, "radius.lg")).toBe(theme.radius.lg)
    expect(readToken(theme, "typography.scale.h2.fontWeight")).toBe(600)
    expect(readToken(theme, "spacing.4")).toBe(theme.spacing.scale[4])
  })

  it("reads nothing where the theme holds nothing", () => {
    expect(readToken(theme, "colors.custom.mint")).toBeUndefined()
    expect(readToken(theme, "spacing.99")).toBeUndefined()
    expect(readToken(theme, "colors.primary.dark")).toBeUndefined()
    expect(readToken(theme, "typography.scale")).toBeUndefined()
    expect(readToken(theme, "spacing.base.x")).toBeUndefined()
  })
})

describe("compiling a theme", () => {
  it("scopes every variable to the checkout root and never to :root", () => {
    const { css } = compileTheme(theme)

    expect(css).toContain(`.${ROOT_CLASS} {`)
    // The editor canvas renders a checkout inside the Studio document. Leaking
    // to :root is how a user's brand colour tints our toolbar.
    expect(css).not.toContain(":root")
  })

  it("declares a variable for every token", () => {
    const { css } = compileTheme(theme)

    expect(css).toContain(`--ck-color-primary: ${theme.colors.primary};`)
    expect(css).toContain(`--ck-radius-lg: ${theme.radius.lg};`)
    expect(css).toContain("--ck-space-6: 32px;")
    expect(css).toContain("--ck-text-h1-weight: 700;")
    expect(css).toContain(`--ck-easing: ${theme.motion.easing};`)
  })

  it("keys the compilation on the theme id and version", () => {
    expect(compileTheme(theme).key).toBe(`${theme.id}:${theme.version}`)
  })

  it("memoises on that key, and recompiles when the version moves", () => {
    const first = compileTheme(theme)
    const again = compileTheme({ ...theme, name: "Renamed" })
    const bumped = compileTheme({ ...theme, version: "1.0.1" })

    // Editing a theme bumps its patch version, so the key changes exactly when
    // the output would.
    expect(again).toBe(first)
    expect(bumped).not.toBe(first)
  })

  it("emits the dark layer sparsely, and only what differs", () => {
    const { css } = compileTheme(theme)

    expect(css).toContain(`.${ROOT_CLASS}[data-mode="dark"] {`)
    const dark = css.slice(css.indexOf('[data-mode="dark"]'))
    expect(dark).toContain("--ck-color-surface:")
    // The brand colour survives a mode switch; only surfaces and text invert.
    expect(dark).not.toContain("--ck-color-primary:")
  })

  it("emits no dark block for a theme with no dark layer", () => {
    const { dark, ...light } = theme

    expect(dark).toBeDefined()
    expect(compileTheme(light).css).not.toContain("data-mode")
  })

  it("redeclares spacing and type size per breakpoint, and nothing else", () => {
    const mobile = mediaBlock(compileTheme(theme).css, 767)

    // Density and fluid type are the two things a theme scales globally, so
    // they are the only variables a media query touches.
    expect(mobile).toContain("--ck-space-")
    expect(mobile).toContain("--ck-text-body-size:")
    expect(mobile).not.toContain("--ck-color-")
    expect(mobile).toContain("--ck-space-6: 28px;")
  })

  it("emits no media query for a breakpoint that scales nothing", () => {
    const flat = {
      ...theme,
      spacing: { ...theme.spacing, density: { desktop: 1, tablet: 1, mobile: 1 } },
      typography: { ...theme.typography, fluidScale: { desktop: 1, tablet: 1, mobile: 1 } },
    }

    expect(compileTheme(flat).css).not.toContain("@media")
  })

  it("scales only the type sizes it can read as pixels", () => {
    const relative = {
      ...theme,
      typography: {
        ...theme.typography,
        scale: {
          ...theme.typography.scale,
          body: { ...theme.typography.scale.body, fontSize: "1rem" },
        },
      },
    }

    const mobile = mediaBlock(compileTheme(relative).css, 767)

    expect(mobile).not.toContain("--ck-text-body-size:")
    expect(mobile).toContain("--ck-text-h1-size:")
  })

  it("rounds a scaled value rather than emitting a float nobody wrote", () => {
    const { css } = compileTheme({
      ...theme,
      spacing: { ...theme.spacing, density: { desktop: 1, tablet: 1, mobile: 0.33 } },
    })

    expect(css).toContain("--ck-space-1: 1.32px;")
  })

  it("leaves out a value it cannot safely emit, and says which", () => {
    const hostile = {
      ...theme,
      version: "1.0.2",
      colors: { ...theme.colors, primary: "red; position: fixed" },
    }

    const compiled = compileTheme(hostile)

    expect(compiled.css).not.toContain("position: fixed")
    expect(compiled.rejected).toEqual([{ path: "colors.primary", value: "red; position: fixed" }])
  })

  it("leaves out a dark value it cannot safely emit", () => {
    const compiled = compileTheme({
      ...theme,
      version: "1.0.3",
      dark: {
        colors: { surface: "@import url(https://evil.example.com/x.css)", custom: { mint: "}" } },
      },
    })

    expect(compiled.css).not.toContain("@import")
    expect(compiled.rejected.map((entry) => entry.path)).toEqual([
      "dark.colors.surface",
      "dark.colors.custom.mint",
    ])
  })

  it("emits a dark custom colour", () => {
    const compiled = compileTheme({
      ...theme,
      version: "1.0.5",
      colors: { ...theme.colors, custom: { mint: "#10b981" } },
      dark: { colors: { custom: { mint: "#34d399" } } },
    })

    expect(compiled.rejected).toEqual([])
    expect(compiled.css.slice(compiled.css.indexOf("data-mode"))).toContain(
      "--ck-color-custom-mint: #34d399;",
    )
  })

  it("skips a dark entry that is not a value at all", () => {
    const compiled = compileTheme({
      ...theme,
      version: "1.0.4",
      dark: { colors: { custom: {} }, radius: { lg: "20px" } },
    })

    expect(compiled.rejected).toEqual([])
    expect(compiled.css).toContain("--ck-radius-lg: 20px;")
  })

  it("compiles a numeric token to pixels", () => {
    // Spacing steps are stored as numbers. A bare number in CSS is a ratio, not
    // a length, so `padding: 24` would be ignored outright.
    expect(compileTheme(theme).css).toContain("--ck-space-5: 24px;")
  })

  it("emits a reference as a var, so the chain resolves in the browser", () => {
    const aliased = {
      ...theme,
      version: "1.1.0",
      colors: { ...theme.colors, custom: { brand: "{colors.primary}" } },
    }

    expect(compileTheme(aliased).css).toContain("--ck-color-custom-brand: var(--ck-color-primary);")
  })

  it("rejects a reference to a path that names nothing", () => {
    const broken = {
      ...theme,
      version: "1.2.0",
      colors: { ...theme.colors, custom: { brand: "{colors.primry}" } },
    }

    const compiled = compileTheme(broken)

    expect(compiled.css).not.toContain("--ck-color-custom-brand")
    expect(compiled.rejected).toEqual([{ path: "colors.custom.brand", value: "{colors.primry}" }])
  })

  it("matches the default theme it was given", () => {
    expect(compileTheme(defaultTheme).key).toBe(`${defaultTheme.id}:${defaultTheme.version}`)
  })
})

describe("compiling for one breakpoint", () => {
  it("puts that breakpoint's scaled values in the base block, with no query", () => {
    const { css } = compileTheme(theme, { breakpoint: "mobile" })

    // A 390px device frame inside a 1440px window would match the desktop
    // query; a 1440px frame inside a 900px window would match the tablet one.
    // Neither can happen if there is no query.
    expect(css).not.toContain("@media (max-width")
    expect(css).toContain("--ck-space-6: 28px;")
    expect(css).toContain("--ck-text-body-size: 14.4px;")
  })

  it("emits the unscaled values for the widest breakpoint", () => {
    const { css } = compileTheme(theme, { breakpoint: "desktop" })

    expect(css).not.toContain("@media (max-width")
    expect(css).toContain("--ck-space-6: 32px;")
  })

  it("keys the memo on the breakpoint as well", () => {
    const all = compileTheme(theme)
    const mobile = compileTheme(theme, { breakpoint: "mobile" })

    expect(mobile).not.toBe(all)
    expect(mobile.key).toBe(`${theme.id}:${theme.version}:mobile`)
    expect(compileTheme(theme, { breakpoint: "mobile" })).toBe(mobile)
  })
})
