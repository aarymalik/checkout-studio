import { describe, expect, it } from "vitest"

import { tokenReferences } from "../src"
import { makeDocument, makeNode, sampleDocument } from "./support"
import type { CheckoutSchema, ResponsiveStyles } from "../src/document/schema"

/**
 * Every theme token a document refers to.
 *
 * The mirror of the asset walk, and these are mostly about the same two
 * failures: a place a reference can hide, and a value that looks like one and
 * is not. A miss means an export that does not declare the theme it needs; a
 * false positive means a bundle demanding a token nothing uses.
 */

function paths(document: CheckoutSchema): string[] {
  return [...tokenReferences(document)].sort()
}

function styled(styles: ResponsiveStyles): CheckoutSchema {
  return makeDocument([
    makeNode("root", { type: "core.page", children: ["text"] }),
    makeNode("text", { type: "core.text", parentId: "root", styles }),
  ])
}

describe("a document that names no token", () => {
  it("refers to none", () => {
    expect(paths(sampleDocument())).toEqual([])
  })

  it("is not confused by a style holding a literal", () => {
    expect(paths(styled({ desktop: { base: { color: "#ff0000", fontSize: "16px" } } }))).toEqual([])
  })

  it("ignores a style value that is not a string", () => {
    expect(paths(styled({ desktop: { base: { opacity: 0.5, grow: true, flex: null } } }))).toEqual(
      [],
    )
  })
})

describe("a reference in a style", () => {
  it("is found", () => {
    expect(paths(styled({ desktop: { base: { color: "{colors.primary}" } } }))).toEqual([
      "colors.primary",
    ])
  })

  it("is found at every breakpoint and in every state", () => {
    const document = styled({
      desktop: { base: { color: "{colors.primary}" }, hover: { color: "{colors.primaryHover}" } },
      tablet: { base: { padding: "{spacing.4}" } },
      mobile: { focus: { outlineColor: "{colors.focusRing}" } },
    })

    expect(paths(document)).toEqual([
      "colors.focusRing",
      "colors.primary",
      "colors.primaryHover",
      "spacing.4",
    ])
  })

  it("is counted once however many nodes name it", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page", children: ["a", "b"] }),
      makeNode("a", { type: "core.text", parentId: "root", styles: dark() }),
      makeNode("b", { type: "core.text", parentId: "root", styles: dark() }),
    ])

    expect(paths(document)).toEqual(["colors.foreground"])
  })

  it("reads a nested custom path", () => {
    expect(paths(styled({ desktop: { base: { color: "{colors.custom.mint}" } } }))).toEqual([
      "colors.custom.mint",
    ])
  })

  it("is found with whitespace around it, because a value is trimmed", () => {
    expect(paths(styled({ desktop: { base: { color: "  {colors.primary}  " } } }))).toEqual([
      "colors.primary",
    ])
  })
})

describe("a value that is not a reference", () => {
  it.each([
    ["a bare path", "colors.primary"],
    ["a path with no segment", "{colors}"],
    ["one of several values", "1px solid {colors.border}"],
    ["an unclosed brace", "{colors.primary"],
    ["something else's placeholder", "${colors.primary}"],
  ])("is left alone: %s", (_name, value) => {
    /*
     * The pattern anchors to the whole value on purpose, and this is where
     * that shows. `1px solid {colors.border}` is a shorthand nothing resolves
     * today — collecting half of it would declare a dependency the renderer
     * will not honour, which is worse than not declaring it.
     */
    expect(paths(styled({ desktop: { base: { border: value } } }))).toEqual([])
  })
})

describe("a reference-shaped string in a prop", () => {
  it("is not a token, because props are where assets live", () => {
    // Assets are objects and tokens are strings, so each walk looks in one
    // place. A prop that happens to read like a token is component data.
    const document = makeDocument([
      makeNode("root", { type: "core.page", children: ["text"] }),
      makeNode("text", {
        type: "core.text",
        parentId: "root",
        props: { text: "{colors.primary}" },
      }),
    ])

    expect(paths(document)).toEqual([])
  })
})

function dark(): ResponsiveStyles {
  return { desktop: { base: { color: "{colors.foreground}" } } }
}
