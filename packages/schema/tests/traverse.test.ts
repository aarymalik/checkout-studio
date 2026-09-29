import { describe, expect, it } from "vitest"

import {
  ancestors,
  collect,
  isDescendant,
  siblings,
  subtreeIds,
  traverse,
} from "../src/tree/traverse"
import { deepDocument, makeDocument, makeNode, sampleDocument, withNodeAt } from "./support"

describe("traverse", () => {
  it("visits depth-first, in document order", () => {
    const seen: string[] = []

    traverse(sampleDocument(), ({ node }) => void seen.push(node.id))

    expect(seen).toEqual(["root", "section", "heading", "text", "footer"])
  })

  it("reports depth and sibling position", () => {
    const seen: Array<[string, number, number]> = []

    traverse(sampleDocument(), ({ node, depth, index }) => void seen.push([node.id, depth, index]))

    expect(seen).toEqual([
      ["root", 0, 0],
      ["section", 1, 0],
      ["heading", 2, 0],
      ["text", 2, 1],
      ["footer", 1, 1],
    ])
  })

  // Not just the branch: a caller looking for one node should not pay for the
  // rest of the tree.
  it("stops the whole walk when the visitor returns false", () => {
    const seen: string[] = []

    traverse(sampleDocument(), ({ node }) => {
      seen.push(node.id)

      return node.id !== "section"
    })

    expect(seen).toEqual(["root", "section"])
  })

  it("starts anywhere it is told to", () => {
    const seen: string[] = []

    traverse(sampleDocument(), ({ node }) => void seen.push(node.id), "section")

    expect(seen).toEqual(["section", "heading", "text"])
  })

  it("does nothing for a node that is not there", () => {
    const seen: string[] = []

    traverse(sampleDocument(), ({ node }) => void seen.push(node.id), "nowhere")

    expect(seen).toEqual([])
  })

  it("walks a single node", () => {
    const document = makeDocument([makeNode("root", { type: "core.page" })])

    expect(collect(document).map((node) => node.id)).toEqual(["root"])
  })

  it("skips a child that is listed but missing, rather than throwing", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page", children: ["gone", "here"] }),
      makeNode("here", { parentId: "root" }),
    ])

    expect(collect(document).map((node) => node.id)).toEqual(["root", "here"])
  })

  /*
   * A recursive walk is shorter to read and blows the stack on a deep document,
   * and "deep" is whatever somebody nests — there is no depth limit in the
   * schema, so there cannot be one here.
   */
  it("handles a tree far deeper than the call stack", () => {
    expect(collect(deepDocument(20_000))).toHaveLength(20_001)
  })
})

describe("subtreeIds", () => {
  it("includes the node it starts from", () => {
    expect(subtreeIds(sampleDocument(), "section")).toEqual(["section", "heading", "text"])
  })
})

describe("ancestors", () => {
  it("returns the chain from the root down, inclusive", () => {
    expect(ancestors(sampleDocument(), "heading").map((node) => node.id)).toEqual([
      "root",
      "section",
      "heading",
    ])
  })

  it("returns just the root for the root", () => {
    expect(ancestors(sampleDocument(), "root").map((node) => node.id)).toEqual(["root"])
  })

  it("returns nothing for a node that is not there", () => {
    expect(ancestors(sampleDocument(), "nowhere")).toEqual([])
  })

  // Breadcrumbs should show nothing rather than a partial path presented as
  // whole.
  it("returns nothing when the chain is broken", () => {
    const document = withNodeAt(sampleDocument(), "section", { parentId: "ghost" })

    expect(ancestors(document, "heading")).toEqual([])
  })

  it("returns nothing rather than looping on a cycle", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page" }),
      makeNode("a", { parentId: "b" }),
      makeNode("b", { parentId: "a" }),
    ])

    expect(ancestors(document, "a")).toEqual([])
  })
})

describe("isDescendant", () => {
  it("counts a node as its own descendant", () => {
    expect(isDescendant(sampleDocument(), "section", "section")).toBe(true)
  })

  it("finds a child", () => {
    expect(isDescendant(sampleDocument(), "heading", "section")).toBe(true)
  })

  it("finds a grandchild", () => {
    expect(isDescendant(sampleDocument(), "heading", "root")).toBe(true)
  })

  it("says no for a sibling", () => {
    expect(isDescendant(sampleDocument(), "footer", "section")).toBe(false)
  })

  it("says no for a node that is not there", () => {
    expect(isDescendant(sampleDocument(), "nowhere", "root")).toBe(false)
  })

  it("does not loop on a cycle", () => {
    const document = makeDocument([
      makeNode("root", { type: "core.page" }),
      makeNode("a", { parentId: "b" }),
      makeNode("b", { parentId: "a" }),
    ])

    expect(isDescendant(document, "a", "root")).toBe(false)
  })
})

describe("siblings", () => {
  it("lists the node's siblings, itself included, in order", () => {
    expect(siblings(sampleDocument(), "heading")).toEqual(["heading", "text"])
  })

  it("returns the root alone", () => {
    expect(siblings(sampleDocument(), "root")).toEqual(["root"])
  })

  it("returns nothing for a node that is not there", () => {
    expect(siblings(sampleDocument(), "nowhere")).toEqual([])
  })

  it("returns nothing when the parent is missing", () => {
    const document = sampleDocument()
    document.nodes["stray"] = makeNode("stray", { parentId: "ghost" })

    expect(siblings(document, "stray")).toEqual([])
  })
})
