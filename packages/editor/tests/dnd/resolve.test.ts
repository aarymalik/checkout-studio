import { describe, expect, it } from "vitest"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"

import { edgeBand, indexWithin, resolveDrop } from "../../src/dnd/resolve"
import type { NodeRects } from "../../src/canvas/hit"
import { documentOf } from "../documents"

/**
 * Where a drop would land.
 *
 * Phase 8's first exit criterion is that the drop position is always shown
 * before release, which needs an answer that is one thing — a parent and an
 * index — rather than a hint. These are the cases docs/phases.md names, and the
 * awkward ones are the ones worth reading: an empty container, a container with
 * no height, and a node dragged over itself.
 *
 * Pure arithmetic against supplied boxes, so every case is an example rather
 * than something performed with a mouse. What the boxes actually come out as is
 * the browser's business.
 */

/**
 * page (0,0 400x400)
 *  ├── first  (0,  0 400x100)
 *  ├── box    (0,100 400x200) — a container holding two
 *  │    ├── a (0,110 400x80)
 *  │    └── b (0,200 400x80)
 *  └── last   (0,300 400x100)
 */
function tree(): CheckoutSchema {
  return documentOf("page", [
    { id: "page", type: "core.page", children: ["first", "box", "last"] },
    { id: "first", type: "core.section" },
    { id: "box", type: "core.section", children: ["a", "b"] },
    { id: "a", type: "core.text" },
    { id: "b", type: "core.text" },
    { id: "last", type: "core.section" },
  ])
}

function boxes(): NodeRects {
  return new Map([
    ["page", { x: 0, y: 0, width: 400, height: 400 }],
    ["first", { x: 0, y: 0, width: 400, height: 100 }],
    ["box", { x: 0, y: 100, width: 400, height: 200 }],
    ["a", { x: 0, y: 110, width: 400, height: 80 }],
    ["b", { x: 0, y: 200, width: 400, height: 80 }],
    ["last", { x: 0, y: 300, width: 400, height: 100 }],
  ])
}

describe("the edge band", () => {
  it("is a fraction of the height, capped", () => {
    // A quarter of a short node, so a 40px row still has a middle.
    expect(edgeBand(40)).toBe(10)
    // And capped, so a tall section does not have a 100px "before" band.
    expect(edgeBand(800)).toBe(12)
  })

  it("is nothing for a node with no height", () => {
    expect(edgeBand(0)).toBe(0)
    // Negative is not a height. Clamped rather than inverted.
    expect(edgeBand(-50)).toBe(0)
  })
})

describe("between siblings", () => {
  it("resolves before a node near its top edge", () => {
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 2 })).toEqual({
      overId: "first",
      position: "before",
      parentId: "page",
      index: 0,
    })
  })

  it("resolves after a node near its bottom edge", () => {
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 98 })).toEqual({
      overId: "first",
      position: "after",
      parentId: "page",
      index: 1,
    })
  })

  it("resolves after the last child, which is how a node reaches the end", () => {
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 398 })).toEqual({
      overId: "last",
      position: "after",
      parentId: "page",
      index: 3,
    })
  })

  it("indexes against the list as it is, dragged nodes included", () => {
    /*
     * `move` reads the target index against the children *before* the node is
     * lifted out — its own comment says so. Filtering the dragged node here
     * would shift every position after it by one and land the drop one short.
     */
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 398 }, { dragging: ["first"] })?.index).toBe(3)
  })
})

describe("inside a container", () => {
  it("resolves inside when the point is in the middle", () => {
    const drop = resolveDrop(tree(), boxes(), { x: 200, y: 195 })

    // Between the two children, in the gap: the container is what the pointer
    // is over, and "inside" is what it means.
    expect(drop?.position).toBe("inside")
    expect(drop?.parentId).toBe("box")
  })

  it("picks the gap the pointer is in, not the end of the list", () => {
    // Above `a`'s midpoint, so before it.
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 140 })?.index).toBe(0)
    // Past `a`'s midpoint and before `b`'s: between them.
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 195 })?.index).toBe(1)
  })

  it("resolves between its children when the pointer is over one of them", () => {
    // The deepest node under the point wins, so this is about `a`, not `box`.
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 112 })).toEqual({
      overId: "a",
      position: "before",
      parentId: "box",
      index: 0,
    })
  })

  it("refuses to go inside something that takes no children", () => {
    // The gap between `a` and `b`, so the pointer is over `box` itself rather
    // than over one of its children.
    const drop = resolveDrop(tree(), boxes(), { x: 200, y: 195 }, { canHaveChildren: () => false })

    // Nothing takes children, so the middle of a box is no longer "inside" it:
    // the answer falls back to a side, decided by its own midpoint.
    expect(drop?.overId).toBe("box")
    expect(drop?.position).toBe("before")
    expect(drop?.parentId).toBe("page")
  })
})

describe("an empty container", () => {
  it("takes the drop inside itself, at the only index there is", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["empty"] },
      { id: "empty", type: "core.section" },
    ])
    const rects: NodeRects = new Map([
      ["page", { x: 0, y: 0, width: 400, height: 200 }],
      ["empty", { x: 0, y: 0, width: 400, height: 200 }],
    ])

    expect(resolveDrop(document, rects, { x: 200, y: 100 })).toEqual({
      overId: "empty",
      position: "inside",
      parentId: "empty",
      index: 0,
    })
  })
})

describe("a container with no height", () => {
  it("resolves inside it rather than dividing by it", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["flat"] },
      { id: "flat", type: "core.section" },
    ])
    const rects: NodeRects = new Map([
      ["page", { x: 0, y: 0, width: 400, height: 200 }],
      ["flat", { x: 0, y: 50, width: 400, height: 0 }],
    ])

    // No bands at all, which falls out of the arithmetic: a quarter of zero is
    // zero, so every point is in the middle.
    expect(resolveDrop(document, rects, { x: 200, y: 50 })).toEqual({
      overId: "flat",
      position: "inside",
      parentId: "flat",
      index: 0,
    })
  })

  it("falls to a side when it cannot hold children", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["flat"] },
      { id: "flat", type: "core.text" },
    ])
    const rects: NodeRects = new Map([
      ["page", { x: 0, y: 0, width: 400, height: 200 }],
      ["flat", { x: 0, y: 50, width: 400, height: 0 }],
    ])

    expect(
      resolveDrop(document, rects, { x: 200, y: 50 }, { canHaveChildren: () => false })?.position,
    ).toBe("after")
  })
})

describe("what is being dragged", () => {
  it("is not a candidate for its own drop", () => {
    const drop = resolveDrop(tree(), boxes(), { x: 200, y: 50 }, { dragging: ["first"] })

    // Without this, the dragged node is the deepest thing under the pointer for
    // the whole gesture and every drop resolves to "beside where you are".
    expect(drop?.overId).not.toBe("first")
  })

  it("takes its descendants with it", () => {
    const drop = resolveDrop(tree(), boxes(), { x: 200, y: 210 }, { dragging: ["box"] })

    // A section dragged over its own card is still over itself.
    expect(drop?.overId).not.toBe("box")
    expect(drop?.overId).not.toBe("b")
  })

  it("does not walk forever over a document that loops", () => {
    /*
     * `children` forming a loop would walk for ever, and a frozen tab is a
     * worse failure than any wrong answer this could give. The store refuses to
     * open such a document, but this runs on every pointer move and is not the
     * place to discover that something slipped through.
     */
    const document = tree()
    const looped = {
      ...document,
      nodes: {
        ...document.nodes,
        box: { ...(document.nodes["box"] as Node), children: ["a", "box"] },
      },
    }

    expect(() =>
      resolveDrop(looped, boxes(), { x: 200, y: 50 }, { dragging: ["box"] }),
    ).not.toThrow()
  })

  it("ignores a dragged id the document does not contain", () => {
    // A stale id from a gesture that outlived the node it started on.
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 50 }, { dragging: ["ghost"] })?.overId).toBe(
      "first",
    )
  })

  it("leaves the page as the floor when everything else is dragged", () => {
    const drop = resolveDrop(
      tree(),
      boxes(),
      { x: 200, y: 200 },
      { dragging: ["first", "box", "last"] },
    )

    /*
     * Index 2, not 0. Every child counts towards the index whether it is being
     * dragged or not, because `move` reads it against the list before anything
     * is lifted out — and the point sits past `first` and `box`'s midpoints.
     */
    expect(drop).toEqual({ overId: "page", position: "inside", parentId: "page", index: 2 })
  })
})

describe("the page itself", () => {
  it("takes a drop over its background", () => {
    const rects: NodeRects = new Map([["page", { x: 0, y: 0, width: 400, height: 400 }]])

    // Nothing but the page was measured, so none of its children has a
    // position to be above: the drop goes to the end.
    expect(resolveDrop(tree(), rects, { x: 200, y: 200 })).toEqual({
      overId: "page",
      position: "inside",
      parentId: "page",
      index: 3,
    })
  })

  it("has no before and no after", () => {
    const document = documentOf("page", [{ id: "page", type: "core.page" }])
    const rects: NodeRects = new Map([["page", { x: 0, y: 0, width: 400, height: 400 }]])

    // Dropping "before the page" is not a place. Inside it is the nearest thing
    // the user can have meant.
    expect(resolveDrop(document, rects, { x: 200, y: 1 })?.position).toBe("inside")
  })
})

describe("nowhere at all", () => {
  it("answers null for a point outside the frame", () => {
    // Null rather than a guess, which is the thing this phase exists to remove.
    expect(resolveDrop(tree(), boxes(), { x: 200, y: 900 })).toBeNull()
    expect(resolveDrop(tree(), boxes(), { x: -40, y: 200 })).toBeNull()
  })

  it("answers null when nothing has been measured", () => {
    expect(resolveDrop(tree(), new Map(), { x: 200, y: 200 })).toBeNull()
  })

  it("answers null for a document with no root", () => {
    const document = { ...tree(), root: "gone" }

    expect(resolveDrop(document, boxes(), { x: 200, y: 200 })).toBeNull()
  })

  it("answers null when the node it resolved to was never measured", () => {
    const rects: NodeRects = new Map([["page", { x: 0, y: 0, width: 400, height: 400 }]])
    const document = tree()

    // `nodeAt` only returns what it found a box for, so reaching this needs the
    // page measured and nothing else — which resolves to the page, not null.
    expect(resolveDrop(document, rects, { x: 200, y: 200 })?.overId).toBe("page")
  })
})

describe("indexing within a parent", () => {
  it("counts a child that drew nothing, rather than losing its place", () => {
    const document = tree()
    const parent = document.nodes["box"] as Node
    const rects: NodeRects = new Map([["b", { x: 0, y: 200, width: 400, height: 80 }]])

    /*
     * `a` has no box, so there is nothing to compare the point against — but it
     * is still the first entry in `children`, and the number returned is an
     * index into that list. Skipping it would return 0 for a point above `b`,
     * which means "before `a`" and is not where the pointer is.
     */
    expect(indexWithin(document, rects, parent, { x: 200, y: 210 })).toBe(1)
    expect(indexWithin(document, rects, parent, { x: 200, y: 260 })).toBe(2)
  })

  it("counts every child, so the index means what it says", () => {
    const document = tree()
    const parent = document.nodes["box"] as Node

    // `a` 110–190 (midpoint 150), `b` 200–280 (midpoint 240).
    expect(indexWithin(document, boxes(), parent, { x: 200, y: 140 })).toBe(0)
    expect(indexWithin(document, boxes(), parent, { x: 200, y: 195 })).toBe(1)
    expect(indexWithin(document, boxes(), parent, { x: 200, y: 290 })).toBe(2)
  })

  it("answers zero for a container with no children", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["empty"] },
      { id: "empty", type: "core.section" },
    ])
    const parent = document.nodes["empty"] as Node

    expect(indexWithin(document, new Map(), parent, { x: 0, y: 0 })).toBe(0)
  })
})
