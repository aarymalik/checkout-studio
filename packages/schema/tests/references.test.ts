import { describe, expect, it } from "vitest"

import { assetReferences, assetReferrers } from "../src"
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

describe("which nodes name an asset", () => {
  /**
   * What a bundle's asset registry records, and what an import rewrites.
   *
   * The ids alone answer "load this" and "is this still used". Neither
   * answers "where do I point this after the asset lands under a new id",
   * which is why the richer walk is the one that exists and the set is a view
   * of it.
   */

  function withNodes(...nodes: Parameters<typeof makeNode>[]): ReturnType<typeof makeDocument> {
    return makeDocument(nodes.map(([id, overrides]) => makeNode(id, overrides)))
  }

  it("is the node that holds the prop", () => {
    const document = withNodes(
      ["root", { type: "core.page", children: ["img"] }],
      ["img", { type: "core.image", parentId: "root", props: { src: { $asset: "ast_1" } } }],
    )

    expect([...assetReferrers(document)]).toEqual([["ast_1", ["img"]]])
  })

  it("is every node that holds one, in a fixed order", () => {
    // Walk order is a fact about the tree, not about the page. Sorting keeps
    // a registry from changing because a node moved and moved back.
    const document = withNodes(
      ["root", { type: "core.page", children: ["zebra", "apple"] }],
      ["zebra", { type: "core.image", parentId: "root", props: { src: { $asset: "ast_1" } } }],
      ["apple", { type: "core.image", parentId: "root", props: { src: { $asset: "ast_1" } } }],
    )

    expect(assetReferrers(document).get("ast_1")).toEqual(["apple", "zebra"])
  })

  it("names a node once however many of its props point at the same asset", () => {
    const document = withNodes(
      ["root", { type: "core.page", children: ["card"] }],
      [
        "card",
        {
          type: "core.card",
          parentId: "root",
          props: { background: { $asset: "ast_1" }, icon: { $asset: "ast_1" } },
        },
      ],
    )

    expect(assetReferrers(document).get("ast_1")).toEqual(["card"])
  })

  it("reaches a reference nested in an array of objects", () => {
    const document = withNodes(
      ["root", { type: "core.page", children: ["list"] }],
      [
        "list",
        {
          type: "core.list",
          parentId: "root",
          props: { items: [{ icon: { $asset: "ast_1" } }, { icon: { $asset: "ast_2" } }] },
        },
      ],
    )

    expect([...assetReferrers(document)]).toEqual([
      ["ast_1", ["list"]],
      ["ast_2", ["list"]],
    ])
  })

  it("records one the settings name with no node at all", () => {
    /*
     * The favicon and the social image belong to the document. An empty list
     * is the truth: anything rewriting references by node id has to reach
     * them separately, exactly as this walk does.
     */
    const document = makeDocument([makeNode("root", { type: "core.page" })])
    const withFavicon = { ...document, settings: { favicon: { $asset: "ast_icon" } } }

    expect([...assetReferrers(withFavicon)]).toEqual([["ast_icon", []]])
  })

  it("keeps the nodes when the settings name the same asset", () => {
    const document = withNodes(
      ["root", { type: "core.page", children: ["img"] }],
      ["img", { type: "core.image", parentId: "root", props: { src: { $asset: "ast_1" } } }],
    )
    const alsoFavicon = { ...document, settings: { favicon: { $asset: "ast_1" } } }

    expect(assetReferrers(alsoFavicon).get("ast_1")).toEqual(["img"])
  })

  it("agrees with the ids the set reports", () => {
    // The set is a view of this, so a document that disagreed would mean two
    // walks had grown back.
    const document = withNodes(
      ["root", { type: "core.page", children: ["img"] }],
      ["img", { type: "core.image", parentId: "root", props: { src: { $asset: "ast_1" } } }],
    )
    const alsoFavicon = { ...document, settings: { favicon: { $asset: "ast_icon" } } }

    expect([...assetReferrers(alsoFavicon).keys()]).toEqual([...assetReferences(alsoFavicon)])
  })
})
