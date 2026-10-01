import { describe, expect, it } from "vitest"

import { widerThan } from "../src/styles/breakpoints"
import {
  DEFERRED_CLASS,
  HIDE_CLASS,
  HIDE_CLASS_ACTIVE,
  classFor,
  declarationsToCss,
  emitNodeCss,
  hideClasses,
  propertyName,
  visibilityCss,
} from "../src/styles/css"
import {
  baseLayer,
  declaredStates,
  inheritanceChain,
  layeredProperties,
  resolveAllStyles,
  resolveStyle,
  themeStyles,
} from "../src/styles/resolve"
import {
  MAX_REFERENCE_DEPTH,
  referenceProblems,
  resolveDeclarations,
  resolveValue,
} from "../src/styles/tokens"
import { boxSlot, definition, documentOf, theme } from "./support"

const node = (styles = {}) =>
  documentOf("n", [{ id: "n", type: "core.section", styles }]).nodes["n"]!

describe("resolving one value", () => {
  it("turns a number into pixels", () => {
    expect(resolveValue(theme, 16)).toEqual({ ok: true, value: "16px" })
  })

  it("leaves a unitless property unitless", () => {
    // `font-weight: 700px` and `line-height: 1.6px` are declarations the
    // browser discards without saying so.
    expect(resolveValue(theme, 700, "fontWeight")).toEqual({ ok: true, value: "700" })
    expect(resolveValue(theme, 1.6, "lineHeight")).toEqual({ ok: true, value: "1.6" })
    expect(resolveValue(theme, 16, "fontSize")).toEqual({ ok: true, value: "16px" })
  })

  it("turns a reference into a variable", () => {
    expect(resolveValue(theme, "{colors.primary}")).toEqual({
      ok: true,
      value: "var(--ck-color-primary)",
    })
    expect(resolveValue(theme, "{spacing.6}")).toEqual({ ok: true, value: "var(--ck-space-6)" })
  })

  it("passes a literal through", () => {
    expect(resolveValue(theme, "#fff")).toEqual({ ok: true, value: "#fff" })
    expect(resolveValue(theme, "1px solid currentColor")).toEqual({
      ok: true,
      value: "1px solid currentColor",
    })
  })

  it("refuses a literal that could escape its declaration", () => {
    // A node's styles are user-authored too, and `url(javascript:…)` arrives
    // exactly the way a theme value would.
    expect(resolveValue(theme, "url(javascript:alert(1))")).toEqual({
      ok: false,
      reference: "url(javascript:alert(1))",
      reason: "unsafe",
    })
    expect(resolveValue(theme, "red; position: fixed")).toEqual({
      ok: false,
      reference: "red; position: fixed",
      reason: "unsafe",
    })
  })

  it("refuses a reference to a path that names nothing", () => {
    expect(resolveValue(theme, "{colors.primry}")).toEqual({
      ok: false,
      reference: "{colors.primry}",
      reason: "unresolvable",
    })
    expect(resolveValue(theme, "{mood.cheerful}")).toEqual({
      ok: false,
      reference: "{mood.cheerful}",
      reason: "unresolvable",
    })
  })

  it("follows a reference to another reference", () => {
    const aliased = {
      ...theme,
      colors: { ...theme.colors, custom: { brand: "{colors.primary}" } },
    }

    // The chain is emitted as one var() at its start: the theme's own variables
    // already reference each other, so the browser walks the rest.
    expect(resolveValue(aliased, "{colors.custom.brand}")).toEqual({
      ok: true,
      value: "var(--ck-color-custom-brand)",
    })
  })

  it("refuses a chain that returns to itself", () => {
    const circular = {
      ...theme,
      colors: {
        ...theme.colors,
        custom: { a: "{colors.custom.b}", b: "{colors.custom.a}" },
      },
    }

    expect(resolveValue(circular, "{colors.custom.a}")).toEqual({
      ok: false,
      reference: "{colors.custom.a}",
      reason: "circular",
    })
  })

  it("refuses a chain longer than three levels", () => {
    const deep = {
      ...theme,
      colors: {
        ...theme.colors,
        custom: {
          a: "{colors.custom.b}",
          b: "{colors.custom.c}",
          c: "{colors.custom.d}",
          d: "#fff",
        },
      },
    }

    expect(resolveValue(deep, "{colors.custom.a}").ok).toBe(false)
    expect(resolveValue(deep, "{colors.custom.b}").ok).toBe(true)
    expect(MAX_REFERENCE_DEPTH).toBe(3)
  })

  it("resolves a numeric token at the end of a chain", () => {
    const aliased = {
      ...theme,
      radius: { ...theme.radius, md: "{spacing.2}" },
    }

    expect(resolveValue(aliased, "{radius.md}")).toEqual({
      ok: true,
      value: "var(--ck-radius-md)",
    })
  })
})

describe("reference problems in a theme", () => {
  it("finds nothing wrong with a theme that references nothing", () => {
    expect(referenceProblems(theme)).toEqual([])
  })

  it("finds nothing wrong with a theme whose references resolve", () => {
    const aliased = {
      ...theme,
      colors: { ...theme.colors, custom: { brand: "{colors.primary}" } },
    }

    expect(referenceProblems(aliased)).toEqual([])
  })

  it("reports a cycle before anything renders, naming the path round it", () => {
    const circular = {
      ...theme,
      colors: {
        ...theme.colors,
        custom: { a: "{colors.custom.b}", b: "{colors.custom.a}" },
      },
    }

    const problems = referenceProblems(circular)

    expect(problems.map((problem) => problem.code)).toEqual(["circular", "circular"])
    expect(problems[0]?.path).toBe("colors.custom.a")
    // The chain closes on itself, so the loop is visible in the report.
    expect(problems[0]?.chain).toEqual(["colors.custom.b", "colors.custom.a", "colors.custom.b"])
  })

  it("reports an unresolvable reference", () => {
    const broken = {
      ...theme,
      radius: { ...theme.radius, lg: "{spacing.99}" },
    }

    expect(referenceProblems(broken)).toEqual([
      {
        code: "unresolvable",
        path: "radius.lg",
        value: "{spacing.99}",
        chain: ["spacing.99"],
      },
    ])
  })

  it("reports a chain that is too deep", () => {
    const deep = {
      ...theme,
      colors: {
        ...theme.colors,
        custom: {
          a: "{colors.custom.b}",
          b: "{colors.custom.c}",
          c: "{colors.custom.d}",
          d: "{colors.primary}",
        },
      },
    }

    const problems = referenceProblems(deep)

    expect(problems.map((problem) => problem.code)).toEqual(["too-deep"])
    expect(problems[0]?.path).toBe("colors.custom.a")
  })
})

describe("resolving a block of declarations", () => {
  it("resolves every property", () => {
    const resolved = resolveDeclarations(theme, { color: "{colors.foreground}", padding: 16 }, {})

    expect(resolved.declarations).toEqual({
      color: "var(--ck-color-foreground)",
      padding: "16px",
    })
    expect(resolved.fallbacks).toEqual([])
  })

  it("falls back to the component default and reports it", () => {
    const resolved = resolveDeclarations(
      theme,
      { borderRadius: "{radius.enormous}" },
      { borderRadius: "10px" },
    )

    expect(resolved.declarations).toEqual({ borderRadius: "10px" })
    expect(resolved.fallbacks).toEqual([
      { property: "borderRadius", value: "{radius.enormous}", reason: "unresolvable" },
    ])
  })

  it("drops a property with no default to fall back to, and still reports it", () => {
    const resolved = resolveDeclarations(theme, { boxShadow: "{shadows.enormous}" }, {})

    expect(resolved.declarations).toEqual({})
    expect(resolved.fallbacks).toHaveLength(1)
  })

  it("drops a default that is itself unusable", () => {
    const resolved = resolveDeclarations(
      theme,
      { color: "{colors.nope}" },
      { color: "red; position: fixed" },
    )

    expect(resolved.declarations).toEqual({})
  })

  it("ignores a property set to null or a boolean", () => {
    // The schema permits both, because a style control's "unset" is a null. A
    // declaration is neither.
    const resolved = resolveDeclarations(
      theme,
      { color: null, display: true, padding: 8 },
      { color: "red" },
    )

    expect(resolved.declarations).toEqual({ padding: "8px" })
  })

  it("ignores a default set to null or a boolean", () => {
    const resolved = resolveDeclarations(
      theme,
      { color: "{colors.nope}", margin: "{spacing.99}" },
      { color: null, margin: true },
    )

    expect(resolved.declarations).toEqual({})
    expect(resolved.fallbacks).toHaveLength(2)
  })
})

describe("the six-stage cascade", () => {
  const button = definition("core.button", {
    defaultStyles: { paddingInline: "24px", height: "44px" },
    themeSlot: boxSlot,
  })

  it("takes stage 1 from the component's theme slot", () => {
    const styles = themeStyles(theme, button, node())

    expect(styles).toEqual({
      backgroundColor: "{colors.surface}",
      borderRadius: "{radius.md}",
    })
  })

  it("lets the theme override the slot's registered defaults", () => {
    const styled = {
      ...theme,
      components: { "core.button": { background: "{colors.primary}" } },
    }

    // The plugin's defaults sit beneath whatever the theme set, which is how a
    // component keeps a coherent look in a theme that has never heard of it.
    expect(themeStyles(styled, button, node())).toEqual({
      backgroundColor: "{colors.primary}",
      borderRadius: "{radius.md}",
    })
  })

  it("contributes nothing for a component with no slot", () => {
    expect(themeStyles(theme, definition("core.section"), node())).toEqual({})
  })

  it("contributes nothing for a slot that maps to no CSS", () => {
    const opaque = definition("core.badge", {
      themeSlot: { label: "Badge", schema: boxSlot.schema, defaults: {} },
    })

    expect(themeStyles(theme, opaque, node())).toEqual({})
  })

  it("puts the component's own defaults over the theme's, in stage order", () => {
    const overriding = definition("core.button", {
      defaultStyles: { borderRadius: "0" },
      themeSlot: boxSlot,
    })

    expect(baseLayer(theme, overriding, node())["borderRadius"]).toBe("0")
  })

  it("cascades desktop into tablet into mobile", () => {
    const styled = node({
      desktop: { base: { height: "52px", color: "red" } },
      mobile: { base: { height: "44px" } },
    })

    expect(layeredProperties(styled, "desktop", "base")).toEqual({
      height: "52px",
      color: "red",
    })
    expect(layeredProperties(styled, "tablet", "base")).toEqual({
      height: "52px",
      color: "red",
    })
    expect(layeredProperties(styled, "mobile", "base")).toEqual({
      height: "44px",
      color: "red",
    })
  })

  it("does not cascade upward", () => {
    const styled = node({ mobile: { base: { width: "100%" } } })

    expect(layeredProperties(styled, "desktop", "base")).toEqual({})
    expect(layeredProperties(styled, "mobile", "base")).toEqual({ width: "100%" })
  })

  it("affects tablet and mobile from a tablet override, and not desktop", () => {
    const styled = node({ tablet: { base: { padding: "8px" } } })

    expect(layeredProperties(styled, "desktop", "base")).toEqual({})
    expect(layeredProperties(styled, "tablet", "base")).toEqual({ padding: "8px" })
    expect(layeredProperties(styled, "mobile", "base")).toEqual({ padding: "8px" })
  })

  it("inherits base into every state", () => {
    const styled = node({
      desktop: { base: { color: "red", padding: "8px" }, hover: { color: "blue" } },
    })

    expect(layeredProperties(styled, "desktop", "hover")).toEqual({
      color: "blue",
      padding: "8px",
    })
  })

  it("cascades a state through the breakpoints too", () => {
    const styled = node({
      desktop: { hover: { color: "blue" } },
      mobile: { hover: { color: "green" } },
    })

    expect(layeredProperties(styled, "tablet", "hover")["color"]).toBe("blue")
    expect(layeredProperties(styled, "mobile", "hover")["color"]).toBe("green")
  })

  it("names the breakpoints a value inherits through", () => {
    expect(inheritanceChain("desktop")).toEqual(["desktop"])
    expect(inheritanceChain("tablet")).toEqual(["desktop", "tablet"])
    expect(inheritanceChain("mobile")).toEqual(["desktop", "tablet", "mobile"])
  })

  it("works the example from the theme specification", () => {
    const styled = documentOf("b", [
      {
        id: "b",
        type: "core.button",
        styles: {
          desktop: { base: { height: "52px" } },
          mobile: { base: { height: "44px", width: "100%" } },
        },
      },
    ]).nodes["b"]!

    const resolved = resolveStyle({
      theme: { ...theme, components: { "core.button": { background: "{colors.primary}" } } },
      definition: button,
      node: styled,
      breakpoint: "mobile",
      state: "base",
    })

    expect(resolved.declarations).toEqual({
      backgroundColor: "var(--ck-color-primary)",
      borderRadius: "var(--ck-radius-md)",
      paddingInline: "24px",
      height: "44px",
      width: "100%",
    })
  })

  it("uses the theme default where the node sets nothing", () => {
    const resolved = resolveStyle({
      theme,
      definition: button,
      node: node(),
      breakpoint: "desktop",
      state: "base",
    })

    expect(resolved.declarations["backgroundColor"]).toBe("var(--ck-color-surface)")
  })

  it("uses the component default where the theme sets nothing", () => {
    const resolved = resolveStyle({
      theme,
      definition: button,
      node: node(),
      breakpoint: "desktop",
      state: "base",
    })

    expect(resolved.declarations["paddingInline"]).toBe("24px")
  })
})

describe("resolving every breakpoint at once", () => {
  const button = definition("core.button", { defaultStyles: { height: "44px" } })

  it("names only the states the node declares", () => {
    expect(declaredStates(node())).toEqual(["base"])
    expect(declaredStates(node({ mobile: { hover: { color: "red" } } }))).toEqual(["base", "hover"])
    expect(declaredStates(node({ desktop: { hover: {} } }))).toEqual(["base"])
  })

  it("reduces a narrow breakpoint to what differs from the one above", () => {
    const styled = node({
      desktop: { base: { height: "52px", color: "red" } },
      mobile: { base: { height: "44px" } },
    })

    const resolved = resolveAllStyles(theme, button, styled)

    expect(resolved.blocks.desktop["base"]).toEqual({ height: "52px", color: "red" })
    // Emitting the full block per breakpoint would work and would triple the
    // stylesheet. The wider rule is still in force.
    expect(resolved.blocks.tablet).toEqual({})
    expect(resolved.blocks.mobile["base"]).toEqual({ height: "44px" })
  })

  it("reports an unresolvable reference once, not once per breakpoint", () => {
    const styled = node({ desktop: { base: { color: "{colors.nope}" } } })

    expect(resolveAllStyles(theme, button, styled).fallbacks).toHaveLength(1)
  })

  it("carries states through the breakpoints", () => {
    const styled = node({
      desktop: { base: { color: "red" }, hover: { color: "blue" } },
      mobile: { hover: { color: "green" } },
    })

    const resolved = resolveAllStyles(theme, button, styled)

    expect(resolved.blocks.desktop["hover"]).toEqual({ color: "blue", height: "44px" })
    expect(resolved.blocks.mobile["hover"]).toEqual({ color: "green" })
  })
})

describe("property and class names", () => {
  it("kebab-cases a property", () => {
    expect(propertyName("backgroundColor")).toBe("background-color")
    expect(propertyName("padding")).toBe("padding")
    expect(propertyName("paddingInlineStart")).toBe("padding-inline-start")
  })

  it("keeps a custom property as written", () => {
    expect(propertyName("--ck-local")).toBe("--ck-local")
  })

  it("refuses a property name that is not one", () => {
    // A document arrives as JSON from a database and may have been imported, so
    // "the schema validated it" is a weaker claim here than it looks.
    for (const property of [
      "color: red; position",
      "background url(x)",
      "--ck-a; b",
      "--",
      "1color",
      "",
    ]) {
      expect(propertyName(property), property).toBeNull()
    }
  })

  it("derives a class from the node id", () => {
    expect(classFor("section_x7d9")).toBe("ck-section_x7d9")
    expect(classFor("order-summary_a1b2")).toBe("ck-order-summary_a1b2")
  })

  it("reduces an id to characters a CSS identifier allows", () => {
    expect(classFor("a b.c#d")).toBe("ck-a_b_c_d")
  })

  it("drops a declaration whose property it cannot emit", () => {
    expect(declarationsToCss({ color: "red", "x; y": "z" })).toBe("  color: red;")
  })
})

describe("emitting a node's CSS", () => {
  const button = definition("core.button", { defaultStyles: {} })

  const resolved = (styles = {}) => resolveAllStyles(theme, button, node(styles))

  it("writes the base block scoped to the checkout root", () => {
    const css = emitNodeCss("n", resolved({ desktop: { base: { color: "red" } } }))

    expect(css).toBe(".checkout-root .ck-n {\n  color: red;\n}\n")
  })

  it("writes nothing for a node with no styles", () => {
    expect(emitNodeCss("n", resolved())).toBe("")
  })

  it("writes narrow breakpoints as media queries", () => {
    const css = emitNodeCss(
      "n",
      resolved({
        desktop: { base: { height: "52px" } },
        tablet: { base: { height: "48px" } },
        mobile: { base: { height: "44px" } },
      }),
    )

    expect(css).toContain(
      "@media (max-width: 1023px) {\n  .checkout-root .ck-n {\n    height: 48px;",
    )
    expect(css).toContain(
      "@media (max-width: 767px) {\n  .checkout-root .ck-n {\n    height: 44px;",
    )
    // The narrower query comes last, so it wins: that is the responsive cascade
    // expressed in CSS rather than resolved in JavaScript.
    expect(css.indexOf("767px")).toBeGreaterThan(css.indexOf("1023px"))
  })

  it("writes state selectors", () => {
    const css = emitNodeCss(
      "n",
      resolved({ desktop: { hover: { color: "blue" }, disabled: { opacity: 0.5 } } }),
    )

    expect(css).toContain(".checkout-root .ck-n:hover {")
    // :focus-visible, not :focus — a focus ring on every mouse click is the
    // quickest way a professional-looking page starts to feel cheap.
    expect(css).toContain(
      ".checkout-root .ck-n:disabled, .checkout-root .ck-n[aria-disabled='true']",
    )
    expect(css).toContain("opacity: 0.5;")
  })

  it("writes focus as focus-visible", () => {
    const css = emitNodeCss("n", resolved({ desktop: { focus: { outline: "2px solid" } } }))

    expect(css).toContain(".ck-n:focus-visible {")
  })

  it("resolves one breakpoint and emits no media query for the canvas", () => {
    const css = emitNodeCss(
      "n",
      resolved({
        desktop: { base: { height: "52px", color: "red" } },
        mobile: { base: { height: "44px" } },
      }),
      { activeBreakpoint: "mobile" },
    )

    // A 390px device frame inside a 1440px window would match the desktop query
    // and show the user desktop while they edit mobile.
    expect(css).not.toContain("@media")
    expect(css).toContain("height: 44px;")
    expect(css).toContain("color: red;")
  })

  it("writes nothing for the canvas when the node has no styles", () => {
    expect(emitNodeCss("n", resolved(), { activeBreakpoint: "desktop" })).toBe("")
  })
})

describe("hiding a node at some breakpoints", () => {
  it("adds no class when the node is visible everywhere", () => {
    expect(hideClasses(["desktop", "tablet", "mobile"])).toEqual([])
    expect(visibilityCss([])).toBe("")
  })

  it("names the classes for the breakpoints it is hidden at", () => {
    expect(hideClasses(["desktop"])).toEqual([HIDE_CLASS.tablet, HIDE_CLASS.mobile])
    expect(hideClasses(["mobile"])).toEqual([HIDE_CLASS.desktop, HIDE_CLASS.tablet])
  })

  it("writes each class as display:none in an exclusive range", () => {
    const css = visibilityCss([HIDE_CLASS.desktop, HIDE_CLASS.mobile])

    // Exclusive ranges mean hiding only ever adds a rule. A cascading
    // max-width scheme would have to un-hide a node that reappears narrower,
    // and the only display it could restore is the user agent's — which would
    // flatten the node's own display: flex.
    expect(css).toContain("@media (min-width: 1024px) {")
    expect(css).toContain("@media (max-width: 767px) {")
    expect(css).not.toContain("revert")
    expect(css).not.toContain(HIDE_CLASS.tablet)
  })

  it("writes the tablet range between the other two", () => {
    expect(visibilityCss([HIDE_CLASS.tablet])).toContain(
      "@media (min-width: 768px) and (max-width: 1023px) {",
    )
  })

  it("uses one class and no media query on the canvas", () => {
    expect(hideClasses(["desktop"], { activeBreakpoint: "mobile" })).toEqual([HIDE_CLASS_ACTIVE])
    expect(hideClasses(["desktop"], { activeBreakpoint: "desktop" })).toEqual([])
    expect(visibilityCss([HIDE_CLASS_ACTIVE])).toBe(
      ".checkout-root .ck-hide {\n  display: none !important;\n}\n",
    )
  })

  it("marks a node whose rule only the browser can decide", () => {
    expect(DEFERRED_CLASS).toBe("ck-deferred")
  })
})

describe("breakpoint neighbours", () => {
  it("names the breakpoint immediately wider", () => {
    expect(widerThan("desktop")).toBeNull()
    expect(widerThan("tablet")).toBe("desktop")
    expect(widerThan("mobile")).toBe("tablet")
  })
})
