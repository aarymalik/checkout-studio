import { describe, expect, it } from "vitest"
import { SANS_STACK, defaultTheme } from "@checkout-studio/schema"
import type { CheckoutSchema, CheckoutTheme, FontDefinition, Node } from "@checkout-studio/schema"

import { fontRequirements } from "./fonts"

/**
 * The fonts a bundle declares.
 *
 * The subset itself is the renderer's answer, proved where `planFonts` lives.
 * What is proved here is the translation into a requirement: where a family
 * comes from, which weights are worth stating, and that a system stack is
 * described rather than demanded.
 */

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: "core.text",
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
    ...overrides,
  }
}

function document(nodes: readonly Node[]): CheckoutSchema {
  return {
    version: "1.0.0",
    projectId: "prj_test",
    pageId: "pag_test",
    theme: { themeId: "theme_test" },
    settings: {},
    variables: {},
    root: "root",
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
  }
}

const PAGE = document([
  node("root", { type: "core.page", children: ["copy"] }),
  node("copy", { parentId: "root" }),
])

const WITH_MONO = document([
  node("root", { type: "core.page", children: ["code"] }),
  node("code", {
    parentId: "root",
    styles: { desktop: { base: { fontFamily: "{typography.fontFamily.mono}" } } },
  }),
])

function withFonts(fonts: Partial<CheckoutTheme["typography"]["fontFamily"]>): CheckoutTheme {
  return {
    ...defaultTheme,
    typography: {
      ...defaultTheme.typography,
      fontFamily: { ...defaultTheme.typography.fontFamily, ...fonts },
    },
  }
}

const google: FontDefinition = {
  family: "Inter",
  source: "google",
  weights: [400, 500, 600, 700],
  fallback: SANS_STACK,
}

const custom: FontDefinition = {
  family: "Canela",
  source: "custom",
  weights: [400, 700],
  assetId: "ast_canela",
  fallback: SANS_STACK,
}

describe("a family with a file to fetch", () => {
  it("declares only the weights the page uses", () => {
    /*
     * The theme offers 400, 500, 600 and 700; the default type scale binds
     * 400, 600 and 700. Declaring the offer would make an importer carry a
     * weight nothing renders, which is the cost `planFonts` exists to avoid.
     */
    const requirements = fontRequirements(PAGE, withFonts({ heading: google, body: google }))

    expect(requirements).toEqual([{ family: "Inter", source: "google", weights: [400, 600, 700] }])
  })

  it("names the asset holding it when it is self-hosted", () => {
    const requirements = fontRequirements(PAGE, withFonts({ heading: custom, body: custom }))

    expect(requirements).toEqual([
      { family: "Canela", source: "custom", weights: [400, 700], assetId: "ast_canela" },
    ])
  })
})

describe("a system family", () => {
  it("is described, with the weights the theme offers", () => {
    /*
     * Nothing to install and nothing to fetch — the stack is on the visitor's
     * device. It is in the list because the manifest says what the theme binds,
     * which is how an importer notices a page expecting a family its own theme
     * does not name. Narrowing weights there would be a precision nothing can
     * act on.
     */
    expect(fontRequirements(PAGE, defaultTheme)).toEqual([
      { family: "Inter", source: "system", weights: [400, 500, 600, 700] },
    ])
  })

  it("carries no asset, because there is no file", () => {
    expect(fontRequirements(PAGE, defaultTheme)[0]).not.toHaveProperty("assetId")
  })
})

describe("which families are in the list at all", () => {
  it("is one entry when heading and body share a family", () => {
    expect(fontRequirements(PAGE, defaultTheme)).toHaveLength(1)
  })

  it("leaves out mono until something asks for it", () => {
    // A monospace family loaded for a checkout with no code on it is waste,
    // and a requirement for one is waste an importer has to honour.
    expect(fontRequirements(PAGE, defaultTheme).map((entry) => entry.family)).toEqual(["Inter"])
  })

  it("includes mono once a node names it", () => {
    expect(fontRequirements(WITH_MONO, defaultTheme).map((entry) => entry.family)).toEqual([
      "Inter",
      "JetBrains Mono",
    ])
  })
})

describe("the order", () => {
  it("is by family and not by the slot a theme happens to bind", () => {
    /*
     * Slot order is heading, body, mono, so a theme whose heading family sorts
     * last is the only arrangement that tells the two apart. Without this the
     * same page exports as a different file the moment a theme swaps two
     * families, and the checksum stops meaning anything.
     */
    const reversed = withFonts({
      heading: { ...custom, family: "Zodiak", assetId: "ast_zodiak" },
      body: { ...google, family: "Alpina" },
    })

    expect(fontRequirements(PAGE, reversed).map((entry) => entry.family)).toEqual([
      "Alpina",
      "Zodiak",
    ])
  })
})
