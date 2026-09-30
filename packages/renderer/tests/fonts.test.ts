import type { CheckoutTheme, FontDefinition } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import {
  MAX_FAMILIES,
  MAX_WEIGHTS,
  fontFaceCss,
  planFonts,
  preloadHrefs,
} from "../src/styles/fonts"
import { at, sampleDocument, theme, wideDocument } from "./support"

function font(overrides: Partial<FontDefinition> = {}): FontDefinition {
  return {
    family: "Inter",
    source: "google",
    weights: [400, 500, 600, 700],
    fallback: ["sans-serif"],
    ...overrides,
  }
}

function withFonts(fonts: Partial<CheckoutTheme["typography"]["fontFamily"]>): CheckoutTheme {
  return {
    ...theme,
    typography: { ...theme.typography, fontFamily: { ...theme.typography.fontFamily, ...fonts } },
  }
}

describe("planning a page's fonts", () => {
  it("needs no request for a system family", () => {
    const plan = planFonts(sampleDocument(), theme)

    expect(plan.faces).toEqual([])
    expect(plan.system).toEqual(["Inter"])
  })

  it("counts one family once, however many slots bind it", () => {
    const plan = planFonts(sampleDocument(), withFonts({ heading: font(), body: font() }))

    expect(plan.faces).toHaveLength(1)
  })

  it("leaves the monospace family out unless a node asks for it", () => {
    // Loading a monospace family for a checkout with no code on it is pure
    // waste, and every unused weight is measured in the CLS budget.
    const plan = planFonts(sampleDocument(), withFonts({ mono: font({ family: "Fira Code" }) }))

    expect(plan.faces).toEqual([])
    expect(plan.system).not.toContain("Fira Code")
  })

  it("includes the monospace family when a node references it", () => {
    const document = sampleDocument(at("desktop", { fontFamily: "{typography.fontFamily.mono}" }))

    const plan = planFonts(document, withFonts({ mono: font({ family: "Fira Code" }) }))

    expect(plan.faces.map((face) => face.family)).toEqual(["Fira Code"])
  })

  it("includes it when a node references the compiled variable", () => {
    const document = sampleDocument(at("desktop", { fontFamily: "var(--ck-font-mono)" }))

    const plan = planFonts(document, withFonts({ mono: font({ family: "Fira Code" }) }))

    expect(plan.faces.map((face) => face.family)).toEqual(["Fira Code"])
  })

  it("ignores a style value that is not a string", () => {
    const document = sampleDocument(at("desktop", { fontWeight: 700, hidden: true }))

    expect(planFonts(document, theme).system).toEqual(["Inter"])
  })

  it("narrows the weights to those the page asks for", () => {
    const document = sampleDocument(at("desktop", { fontWeight: 500 }))
    const plan = planFonts(document, withFonts({ body: font(), heading: font() }))

    // The theme offers 400, 500, 600, 700. The type scale uses 400, 600 and
    // 700, and this node adds 500 — so 500 is loaded because something asks
    // for it, not because the theme mentioned it.
    expect(plan.faces[0]?.weights).toEqual([400, 500, 600, 700])
  })

  it("loads only the weights in use, not everything on offer", () => {
    const light = { ...theme, typography: { ...theme.typography, scale: flatScale(400) } }
    const plan = planFonts(
      sampleDocument(),
      withFonts({ heading: font(), body: font() }) && {
        ...light,
        typography: {
          ...light.typography,
          fontFamily: { ...light.typography.fontFamily, heading: font(), body: font() },
        },
      },
    )

    expect(plan.faces[0]?.weights).toEqual([400])
  })

  it("reads a numeric weight written as a string", () => {
    const document = sampleDocument(at("desktop", { fontWeight: "500" }))
    const light = {
      ...theme,
      typography: {
        ...theme.typography,
        scale: flatScale(400),
        fontFamily: { ...theme.typography.fontFamily, heading: font(), body: font() },
      },
    }

    expect(planFonts(document, light).faces[0]?.weights).toEqual([400, 500])
  })

  it("ignores a weight that is not a number", () => {
    const document = sampleDocument(at("desktop", { fontWeight: "bold" }))
    const light = {
      ...theme,
      typography: {
        ...theme.typography,
        scale: flatScale(400),
        fontFamily: { ...theme.typography.fontFamily, heading: font(), body: font() },
      },
    }

    expect(planFonts(document, light).faces[0]?.weights).toEqual([400])
  })

  it("falls back to the closest weight when nothing matches", () => {
    const light = {
      ...theme,
      typography: {
        ...theme.typography,
        scale: flatScale(400),
        fontFamily: {
          ...theme.typography.fontFamily,
          heading: font({ weights: [700, 900] }),
          body: font({ weights: [700, 900] }),
        },
      },
    }

    // The theme offers 700 and 900, the page asks for 400. Refusing would
    // render no text at all.
    expect(planFonts(sampleDocument(), light).faces[0]?.weights).toEqual([700])
  })

  it("warns about a family that is not self-hosted yet", () => {
    const plan = planFonts(sampleDocument(), withFonts({ heading: font(), body: font() }))

    expect(plan.warnings.map((warning) => warning.code)).toEqual(["not-self-hosted"])
  })

  it("does not warn about a family with an asset", () => {
    const hosted = font({ source: "custom", assetId: "ast_inter" })
    const plan = planFonts(sampleDocument(), withFonts({ heading: hosted, body: hosted }))

    expect(plan.warnings).toEqual([])
    expect(plan.faces[0]?.assetId).toBe("ast_inter")
  })

  it("warns when the budget is exceeded", () => {
    const document = sampleDocument(
      at("desktop", { fontFamily: "{typography.fontFamily.mono}", fontWeight: 300 }),
    )

    const plan = planFonts(
      document,
      withFonts({
        heading: font({ family: "Playfair", source: "custom", assetId: "a" }),
        body: font({ family: "Inter", source: "custom", assetId: "b" }),
        mono: font({ family: "Fira Code", source: "custom", assetId: "c", weights: [300, 400] }),
      }),
    )

    expect(plan.warnings.map((warning) => warning.code)).toEqual([
      "too-many-families",
      "too-many-weights",
    ])
    expect(MAX_FAMILIES).toBe(2)
    expect(MAX_WEIGHTS).toBe(4)
  })

  it("looks at every breakpoint and every node", () => {
    const document = wideDocument(3, at("mobile", { fontWeight: 200 }))
    const light = {
      ...theme,
      typography: {
        ...theme.typography,
        scale: flatScale(400),
        fontFamily: {
          ...theme.typography.fontFamily,
          heading: font({ weights: [200, 400] }),
          body: font({ weights: [200, 400] }),
        },
      },
    }

    expect(planFonts(document, light).faces[0]?.weights).toEqual([200, 400])
  })
})

describe("emitting font rules", () => {
  const hosted = font({ source: "custom", assetId: "ast_inter", weights: [400, 700] })

  it("writes one rule per family, with a weight range", () => {
    const plan = planFonts(sampleDocument(), withFonts({ heading: hosted, body: hosted }))
    const css = fontFaceCss(plan, () => "/fonts/inter.woff2")

    // One asset per family means a variable font, which covers its whole range
    // in one request. Four weights can cost one download.
    expect(css).toContain('font-family: "Inter";')
    expect(css).toContain("font-weight: 400 700;")
    expect(css).toContain("font-display: swap;")
    expect(css.match(/@font-face/g)).toHaveLength(1)
  })

  it("writes a single weight without a range", () => {
    const single = font({ source: "custom", assetId: "a", weights: [500] })
    const light = {
      ...theme,
      typography: {
        ...theme.typography,
        scale: flatScale(500),
        fontFamily: { ...theme.typography.fontFamily, heading: single, body: single },
      },
    }

    expect(fontFaceCss(planFonts(sampleDocument(), light), () => "/a.woff2")).toContain(
      "font-weight: 500;",
    )
  })

  it("writes nothing for a family with no asset", () => {
    const plan = planFonts(sampleDocument(), withFonts({ heading: font(), body: font() }))

    expect(fontFaceCss(plan, () => "/inter.woff2")).toBe("")
  })

  it("writes nothing when the asset resolves to nothing", () => {
    const plan = planFonts(sampleDocument(), withFonts({ heading: hosted, body: hosted }))

    expect(fontFaceCss(plan, () => null)).toBe("")
  })

  it("writes nothing for a system family", () => {
    expect(fontFaceCss(planFonts(sampleDocument(), theme), () => "/x.woff2")).toBe("")
  })

  it("preloads nothing for a family with no file to serve", () => {
    const plan = planFonts(sampleDocument(), withFonts({ heading: font(), body: font() }))

    expect(plan.faces).toHaveLength(1)
    expect(preloadHrefs(plan, () => "/inter.woff2")).toEqual([])
  })

  it("lists what the head should preload", () => {
    const plan = planFonts(sampleDocument(), withFonts({ heading: hosted, body: hosted }))

    expect(preloadHrefs(plan, () => "/fonts/inter.woff2")).toEqual(["/fonts/inter.woff2"])
    expect(preloadHrefs(plan, () => null)).toEqual([])
    expect(preloadHrefs(planFonts(sampleDocument(), theme), () => "/x")).toEqual([])
  })
})

/** A type scale where every step is the same weight, so weight tests are about the nodes. */
function flatScale(weight: number): CheckoutTheme["typography"]["scale"] {
  const scale = { ...theme.typography.scale }

  for (const key of Object.keys(scale) as (keyof typeof scale)[]) {
    scale[key] = { ...scale[key], fontWeight: weight }
  }

  return scale
}
