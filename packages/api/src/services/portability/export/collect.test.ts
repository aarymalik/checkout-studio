import { describe, expect, it } from "vitest"

import { documentReferences } from "./collect"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"

/**
 * What a document names.
 *
 * The walks themselves are proved in the schema package, where they live and
 * where both of their callers can see them. What is proved here is the part
 * this stage adds: that the answer is in a fixed order, and that it stops at
 * what a document can actually be asked.
 */

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: "core.container",
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

function document(
  nodes: readonly Node[],
  settings: CheckoutSchema["settings"] = {},
): CheckoutSchema {
  return {
    version: "1.0.0",
    projectId: "prj_test",
    pageId: "pag_test",
    theme: { themeId: "theme_test" },
    settings,
    variables: {},
    root: "root",
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
  }
}

const PAGE = document(
  [
    node("root", { type: "core.page", children: ["hero", "copy"] }),
    node("hero", {
      type: "core.image",
      parentId: "root",
      props: { src: { $asset: "ast_hero" } },
      styles: { desktop: { base: { borderColor: "{colors.border}" } } },
    }),
    node("copy", {
      type: "core.text",
      parentId: "root",
      styles: { desktop: { base: { color: "{colors.primary}" } } },
    }),
  ],
  { favicon: { $asset: "ast_icon" } },
)

describe("what a document names", () => {
  it("is its component types, its assets and its tokens", () => {
    expect(documentReferences(PAGE)).toEqual({
      componentTypes: ["core.image", "core.page", "core.text"],
      assetIds: ["ast_hero", "ast_icon"],
      tokens: ["colors.border", "colors.primary"],
      totalNodes: 3,
    })
  })

  it("names each component type once, however many nodes use it", () => {
    const repeated = document([
      node("root", { type: "core.page", children: ["a", "b", "c"] }),
      node("a", { type: "core.text", parentId: "root" }),
      node("b", { type: "core.text", parentId: "root" }),
      node("c", { type: "core.text", parentId: "root" }),
    ])

    expect(documentReferences(repeated)).toMatchObject({
      componentTypes: ["core.page", "core.text"],
      totalNodes: 4,
    })
  })

  it("is empty for a page holding nothing but its root", () => {
    expect(documentReferences(document([node("root", { type: "core.page" })]))).toEqual({
      componentTypes: ["core.page"],
      assetIds: [],
      tokens: [],
      totalNodes: 1,
    })
  })
})

describe("the order it comes back in", () => {
  it("is the same whatever order the tree was built in", () => {
    /*
     * A set comes out in insertion order, which is the order the tree happened
     * to be walked. Two exports of a page where a node was moved and moved
     * back would then be different files, and the checksum would stop
     * answering "has this changed?".
     */
    const forwards = document([
      node("root", { type: "core.page", children: ["a", "b"] }),
      node("a", { type: "core.text", parentId: "root", props: { src: { $asset: "ast_2" } } }),
      node("b", { type: "core.badge", parentId: "root", props: { src: { $asset: "ast_1" } } }),
    ])
    const backwards = document([
      node("root", { type: "core.page", children: ["b", "a"] }),
      node("a", { type: "core.text", parentId: "root", props: { src: { $asset: "ast_2" } } }),
      node("b", { type: "core.badge", parentId: "root", props: { src: { $asset: "ast_1" } } }),
    ])

    expect(documentReferences(forwards)).toEqual(documentReferences(backwards))
  })

  it("sorts by code point and not by the exporting machine's locale", () => {
    /*
     * `localeCompare` puts "a" before "B"; a code point comparison puts "B"
     * first. Either is defensible until two installations disagree, at which
     * point the same page has two checksums.
     */
    const mixed = document([
      node("root", { type: "core.page", children: ["one", "two"] }),
      node("one", { type: "aardvark.text", parentId: "root" }),
      node("two", { type: "Zebra.text", parentId: "root" }),
    ])

    expect(documentReferences(mixed).componentTypes).toEqual([
      "Zebra.text",
      "aardvark.text",
      "core.page",
    ])
  })
})

describe("what it leaves to a later stage", () => {
  it("says nothing about plugins, which a type id cannot name", () => {
    /*
     * `core.image` is in the `core` namespace, and `core-layout`,
     * `core-content` and `core-embed` all share it. A plugin requirement
     * derived from the string would be right for one plugin in three, and the
     * registry is the only thing that knows which.
     */
    expect("plugins" in documentReferences(PAGE)).toBe(false)
  })

  it("says nothing about fonts, which live in the theme and not the document", () => {
    expect("fonts" in documentReferences(PAGE)).toBe(false)
  })
})
