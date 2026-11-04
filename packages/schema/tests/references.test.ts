import { describe, expect, it } from "vitest"

import { assetReferences } from "../src"
import { makeDocument, makeNode, sampleDocument, wideDocument } from "./support"

/**
 * Every asset a document refers to.
 *
 * One walk, two callers: the renderer loads what it finds, and deleting an
 * asset asks whether anything still points at it. A place this misses is a
 * broken image in one case and a deleted file still in use in the other, so
 * these are mostly about the places a reference can hide.
 */

function ids(document: Parameters<typeof assetReferences>[0]): string[] {
  return [...assetReferences(document)].sort()
}

describe("a document that names nothing", () => {
  it("refers to no assets", () => {
    expect(ids(sampleDocument())).toEqual([])
  })

  it("is not confused by a document with no nodes at all", () => {
    const empty = makeDocument([makeNode("root", { type: "core.page" })])

    expect(ids(empty)).toEqual([])
  })
})

describe("a reference in a prop", () => {
  it("is found", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page", children: ["img"] }),
      makeNode("img", {
        type: "core.image",
        parentId: "root",
        props: { src: { $asset: "ast_1" } },
      }),
    ])

    expect(ids(document)).toEqual(["ast_1"])
  })

  it("is found inside an array of objects", () => {
    /*
     * A list of features is an array of objects and each may carry an icon.
     * A walk that only looked at the top level of a prop would miss every one.
     */
    const document = makeDocument([
      makeNode("root", {
        type: "core.page",
        props: {
          features: [
            { label: "Fast", icon: { $asset: "ast_fast" } },
            { label: "Safe", icon: { $asset: "ast_safe" } },
          ],
        },
      }),
    ])

    expect(ids(document)).toEqual(["ast_fast", "ast_safe"])
  })

  it("is found however deeply it is buried", () => {
    const document = makeDocument([
      makeNode("root", {
        type: "core.page",
        props: { a: { b: [{ c: { d: { $asset: "ast_deep" } } }] } },
      }),
    ])

    expect(ids(document)).toEqual(["ast_deep"])
  })

  it("is found on any node, not only the root", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page", children: ["one", "two"] }),
      makeNode("one", { type: "core.section", parentId: "root", children: ["deep"] }),
      makeNode("deep", {
        type: "core.image",
        parentId: "one",
        props: { src: { $asset: "ast_deep" } },
      }),
      makeNode("two", {
        type: "core.image",
        parentId: "root",
        props: { src: { $asset: "ast_two" } },
      }),
    ])

    expect(ids(document)).toEqual(["ast_deep", "ast_two"])
  })
})

describe("a reference in the settings", () => {
  it("finds the social image", () => {
    const document = {
      ...sampleDocument(),
      settings: { seo: { image: { $asset: "ast_social" } } },
    }

    expect(ids(document)).toEqual(["ast_social"])
  })

  it("finds the favicon", () => {
    const document = { ...sampleDocument(), settings: { favicon: { $asset: "ast_icon" } } }

    expect(ids(document)).toEqual(["ast_icon"])
  })

  it("finds both, alongside the nodes' own", () => {
    /*
     * Settings belong to the document rather than to any node, so no amount of
     * tree walking reaches them. They are the two easiest to forget.
     */
    const document = {
      ...makeDocument([
        makeNode("root", { type: "core.page", props: { src: { $asset: "ast_node" } } }),
      ]),
      settings: {
        favicon: { $asset: "ast_icon" },
        seo: { image: { $asset: "ast_social" } },
      },
    }

    expect(ids(document)).toEqual(["ast_icon", "ast_node", "ast_social"])
  })
})

describe("what is not a reference", () => {
  it("ignores a variable binding", () => {
    // A variable's value arrives at render time, so a document cannot say in
    // advance which asset it would name.
    const document = makeDocument([
      makeNode("root", { type: "core.page", props: { src: { $var: "order.image" } } }),
    ])

    expect(ids(document)).toEqual([])
  })

  it("ignores a prop that merely looks like one", () => {
    const document = makeDocument([
      makeNode("root", {
        type: "core.page",
        props: { note: "{ $asset: ast_1 }", count: 3, on: true, nothing: null },
      }),
    ])

    expect(ids(document)).toEqual([])
  })

  it("ignores an object whose $asset is not a string", () => {
    // Not a shape the schema admits, and a walk that trusted the key would put
    // a number into a set of ids and ask the database for it.
    const document = makeDocument([
      makeNode("root", { type: "core.page", props: { src: { $asset: 7 } as never } }),
    ])

    expect(ids(document)).toEqual([])
  })
})

describe("the same asset in several places", () => {
  it("is named once", () => {
    // One logo on six nodes is one asset to load and one row to count as in use.
    const document = wideDocument(6)
    const withLogo = {
      ...document,
      nodes: Object.fromEntries(
        Object.entries(document.nodes).map(([id, node]) => [
          id,
          { ...node, props: { src: { $asset: "ast_logo" } } },
        ]),
      ),
    }

    expect(ids(withLogo)).toEqual(["ast_logo"])
  })
})
