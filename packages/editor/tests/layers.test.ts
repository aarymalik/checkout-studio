import { describe, expect, it } from "vitest"

import {
  ROW_HEIGHT,
  expandAll,
  expansionFor,
  flatten,
  indent,
  isUnsupported,
  labelFor,
  moveDown,
  moveUp,
  outdent,
  rowAfter,
  scrollToRow,
  searchLayers,
  windowFor,
} from "../src/layers"
import { nodeAt, nodesIn, selectionFor } from "../src/canvas"
import type { NodeRects } from "../src/canvas"
import { documentOf, nodeAt as fixtureNode } from "./documents"

/**
 * The layers panel and canvas selection, over the same fixture tree:
 *
 * ```
 * page
 * ├── header
 * │   └── title
 * └── body
 *     ├── card
 *     │   └── button
 *     └── footer
 * ```
 */
function tree() {
  return documentOf("page", [
    { id: "page", type: "core.page", children: ["header", "body"] },
    { id: "header", type: "core.section", children: ["title"] },
    { id: "title", type: "core.heading" },
    { id: "body", type: "core.section", children: ["card", "footer"] },
    { id: "card", type: "core.container", children: ["button"] },
    { id: "button", type: "core.button" },
    { id: "footer", type: "core.section" },
  ])
}

describe("row labels", () => {
  it("prefers the name the user gave it", () => {
    const document = documentOf("a", [{ id: "a", type: "core.button", name: "Buy now" }])

    expect(labelFor(fixtureNode(document, "a"))).toBe("Buy now")
  })

  it("falls back to a readable form of the type", () => {
    const document = documentOf("a", [{ id: "a", type: "checkout.order-summary" }])

    // The type id is for the inspector's advanced section, not for a tree the
    // user reads all day.
    expect(labelFor(fixtureNode(document, "a"))).toBe("Order summary")
  })

  it("ignores a name that is only whitespace", () => {
    const document = documentOf("a", [{ id: "a", type: "core.button", name: "   " }])

    expect(labelFor(fixtureNode(document, "a"))).toBe("Button")
  })

  it("marks a node whose plugin is missing", () => {
    const rows = flatten(documentOf("a", [{ id: "a", type: "core.unsupported" }]), new Set())

    expect(isUnsupported(rows[0]!)).toBe(true)
  })
})

describe("flattening the tree", () => {
  it("shows only the root when nothing is expanded", () => {
    expect(flatten(tree(), new Set()).map((row) => row.id)).toEqual(["page"])
  })

  it("shows a node's children once it is expanded", () => {
    expect(flatten(tree(), new Set(["page"])).map((row) => row.id)).toEqual([
      "page",
      "header",
      "body",
    ])
  })

  it("leaves a collapsed node's descendants out entirely", () => {
    // Out rather than marked invisible, so the window arithmetic counts only
    // rows that exist.
    const rows = flatten(tree(), new Set(["page", "body"]))

    expect(rows.map((row) => row.id)).toEqual(["page", "header", "body", "card", "footer"])
    expect(rows.find((row) => row.id === "button")).toBeUndefined()
  })

  it("reports depth, position and parentage for each row", () => {
    const rows = flatten(tree(), expandAll(tree()))
    const button = rows.find((row) => row.id === "button")

    expect(button).toMatchObject({ depth: 3, index: 0, parentId: "card", hasChildren: false })
    expect(rows.find((row) => row.id === "footer")).toMatchObject({ index: 1, depth: 2 })
  })

  it("says which rows can be expanded, and which are", () => {
    const rows = flatten(tree(), new Set(["page"]))

    expect(rows.find((row) => row.id === "header")).toMatchObject({
      hasChildren: true,
      expanded: false,
    })
    expect(rows.find((row) => row.id === "page")?.expanded).toBe(true)
  })

  it("can leave the root out, closing the indent it would have added", () => {
    const rows = flatten(tree(), expandAll(tree()), { includeRoot: false })

    expect(rows.map((row) => row.id)).not.toContain("page")
    expect(rows.find((row) => row.id === "header")?.depth).toBe(0)
  })

  it("carries lock and hide through", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["a"] },
      { id: "a", type: "core.section", locked: true, hidden: true },
    ])

    expect(flatten(document, new Set(["page"]))[1]).toMatchObject({
      locked: true,
      hidden: true,
      inheritedHidden: false,
    })
  })

  it("distinguishes a hidden node from one hidden by its parent", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["a"] },
      { id: "a", type: "core.section", children: ["b"], hidden: true },
      { id: "b", type: "core.button" },
    ])

    const rows = flatten(document, expandAll(document))

    // The eye-off icon belongs to whoever switched it off. Showing it on every
    // descendant suggests nine decisions where there was one.
    expect(rows.find((row) => row.id === "a")).toMatchObject({
      hidden: true,
      inheritedHidden: false,
    })
    expect(rows.find((row) => row.id === "b")).toMatchObject({
      hidden: false,
      inheritedHidden: true,
    })
  })

  it("expands everything that has children, and nothing that does not", () => {
    expect([...expandAll(tree())].sort()).toEqual(["body", "card", "header", "page"])
  })

  it("expands the ancestors of a node so it can be revealed", () => {
    // What selecting on the canvas needs: scrolling to a row that is not
    // rendered shows nothing.
    const expansion = expansionFor(tree(), ["button"], new Set())

    expect([...expansion].sort()).toEqual(["body", "card", "page"])
    expect(flatten(tree(), expansion).map((row) => row.id)).toContain("button")
  })

  it("keeps whatever was already expanded", () => {
    const expansion = expansionFor(tree(), ["title"], new Set(["body"]))

    expect(expansion.has("body")).toBe(true)
    expect(expansion.has("header")).toBe(true)
  })

  it("has nothing to expand for a node that is not there", () => {
    expect([...expansionFor(tree(), ["nowhere"], new Set())]).toEqual([])
  })
})

describe("virtualization", () => {
  it("renders nothing for an empty list", () => {
    expect(windowFor(0, 0, 800)).toEqual({ start: 0, end: 0, above: 0, below: 0, total: 0 })
  })

  it("renders the rows in view plus an overscan margin", () => {
    const result = windowFor(2_000, 0, 800, { overscan: 4 })

    expect(result.start).toBe(0)
    expect(result.end).toBe(Math.ceil(800 / ROW_HEIGHT) + 8)
    expect(result.total).toBe(2_000 * ROW_HEIGHT)
  })

  it("moves the window as the list scrolls, and spaces out what it skipped", () => {
    const result = windowFor(2_000, 1_000, 400, { overscan: 2 })
    const first = Math.floor(1_000 / ROW_HEIGHT) - 2

    expect(result.start).toBe(first)
    expect(result.above).toBe(first * ROW_HEIGHT)
    expect(result.above + result.below).toBe(
      result.total - (result.end - result.start) * ROW_HEIGHT,
    )
  })

  it("renders a small fraction of a large list", () => {
    const result = windowFor(2_000, 5_000, 800)

    expect(result.end - result.start).toBeLessThan(60)
  })

  it("never runs past the end of the list", () => {
    const result = windowFor(10, 0, 4_000)

    expect(result.end).toBe(10)
    expect(result.below).toBe(0)
  })

  it("survives an overscroll bounce and a viewport with no height yet", () => {
    expect(windowFor(100, -50, 800).start).toBe(0)
    expect(windowFor(100, 0, 0).end).toBeGreaterThan(0)
  })

  it("scrolls to a row that is above or below the view", () => {
    expect(scrollToRow(0, 500, 400)).toBe(0)
    expect(scrollToRow(100, 0, 400)).toBe(100 * ROW_HEIGHT + ROW_HEIGHT - 400)
  })

  it("does not scroll to a row already in view", () => {
    expect(scrollToRow(5, 0, 400)).toBeNull()
  })
})

describe("searching", () => {
  const rows = () => flatten(tree(), expandAll(tree()))

  it("returns everything for an empty query", () => {
    expect(searchLayers(rows(), "  ").rows).toHaveLength(7)
  })

  it("matches fuzzily, like the command palette", () => {
    const result = searchLayers(rows(), "btn")

    expect(result.matched.has("button")).toBe(true)
  })

  it("keeps the ancestors of a match, so each result reads in context", () => {
    const result = searchLayers(rows(), "button")

    // "Price" four times with no chain above it tells the user nothing.
    expect(result.rows.map((row) => row.id)).toEqual(["page", "body", "card", "button"])
    expect(result.matched).toEqual(new Set(["button"]))
  })

  it("returns nothing when nothing matches", () => {
    const result = searchLayers(rows(), "zzzzz")

    expect(result.rows).toEqual([])
    expect(result.matched.size).toBe(0)
  })

  it("searches the name the user gave, not the type", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["a"] },
      { id: "a", type: "core.button", name: "Checkout now" },
    ])

    const result = searchLayers(flatten(document, expandAll(document)), "checkout")

    expect(result.matched.has("a")).toBe(true)
  })
})

describe("keyboard reorder", () => {
  it("moves a node up among its siblings", () => {
    expect(moveDown(tree(), "card")).toEqual({ id: "card", parentId: "body", index: 1 })
  })

  it("steps into the sibling above when it can hold children", () => {
    // What the eye expects when the row above is a container's last row.
    expect(moveUp(tree(), "footer")).toEqual({ id: "footer", parentId: "card", index: 1 })
  })

  it("steps into the sibling below at its first position", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["a", "b"] },
      { id: "a", type: "core.button" },
      { id: "b", type: "core.section", children: ["c"] },
      { id: "c", type: "core.button" },
    ])

    expect(moveDown(document, "a")).toEqual({ id: "a", parentId: "b", index: 0 })
  })

  it("lifts a first child out to sit before its parent", () => {
    // How a node escapes a container without the mouse.
    expect(moveUp(tree(), "card")).toEqual({ id: "card", parentId: "page", index: 1 })
  })

  it("drops a last child out past its parent", () => {
    expect(moveDown(tree(), "title")).toEqual({ id: "title", parentId: "page", index: 1 })
  })

  it("has nowhere to go at the very top or the very bottom", () => {
    expect(moveUp(tree(), "header")).toBeNull()
    expect(moveDown(tree(), "body")).toBeNull()
  })

  it("will not move the root", () => {
    expect(moveUp(tree(), "page")).toBeNull()
    expect(moveDown(tree(), "page")).toBeNull()
    expect(indent(tree(), "page")).toBeNull()
    expect(outdent(tree(), "page")).toBeNull()
  })

  it("will not move a node that is not there", () => {
    expect(moveUp(tree(), "nowhere")).toBeNull()
    expect(moveDown(tree(), "nowhere")).toBeNull()
  })

  it("indents a node into the sibling above it", () => {
    expect(indent(tree(), "body")).toEqual({ id: "body", parentId: "header", index: 1 })
  })

  it("cannot indent a first child, which has no sibling above", () => {
    expect(indent(tree(), "header")).toBeNull()
  })

  it("outdents a node to just after its parent", () => {
    expect(outdent(tree(), "button")).toEqual({ id: "button", parentId: "body", index: 1 })
  })

  it("moves focus through the visible rows", () => {
    const rows = flatten(tree(), new Set(["page"]))

    expect(rowAfter(rows, "page", 1)).toBe("header")
    expect(rowAfter(rows, "body", -1)).toBe("header")
  })

  it("stays put at the ends of the list", () => {
    const rows = flatten(tree(), new Set(["page"]))

    expect(rowAfter(rows, "page", -1)).toBe("page")
    expect(rowAfter(rows, "body", 1)).toBe("body")
  })

  it("enters the list from either end when nothing is focused", () => {
    const rows = flatten(tree(), new Set(["page"]))

    expect(rowAfter(rows, null, 1)).toBe("page")
    expect(rowAfter(rows, null, -1)).toBe("body")
    expect(rowAfter([], null, 1)).toBeNull()
  })

  it("can still focus a locked row, so it can be unlocked", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["a"] },
      { id: "a", type: "core.section", locked: true },
    ])

    // Locking stops a node being edited, not being looked at.
    expect(rowAfter(flatten(document, new Set(["page"])), "page", 1)).toBe("a")
  })
})

describe("canvas hit testing", () => {
  const rects: NodeRects = new Map([
    ["page", { x: 0, y: 0, width: 1440, height: 900 }],
    ["header", { x: 0, y: 0, width: 1440, height: 100 }],
    ["title", { x: 20, y: 20, width: 200, height: 40 }],
    ["body", { x: 0, y: 100, width: 1440, height: 700 }],
    ["card", { x: 100, y: 200, width: 400, height: 300 }],
    ["button", { x: 150, y: 250, width: 120, height: 44 }],
    ["footer", { x: 0, y: 600, width: 1440, height: 200 }],
  ])

  it("takes the deepest node under the pointer", () => {
    // A button inside a card inside a section is three hits, and they meant the
    // button.
    expect(nodeAt(tree(), rects, { x: 200, y: 270 })).toBe("button")
  })

  it("takes the container when the pointer misses its children", () => {
    expect(nodeAt(tree(), rects, { x: 450, y: 450 })).toBe("card")
  })

  it("never returns the root", () => {
    // Clicking the page background clears the selection.
    expect(nodeAt(tree(), rects, { x: 1400, y: 880 })).toBeNull()
  })

  it("returns nothing outside every box", () => {
    expect(nodeAt(tree(), rects, { x: -10, y: -10 })).toBeNull()
  })

  it("ignores a node that has not been measured", () => {
    const partial: NodeRects = new Map([["header", rects.get("header")!]])

    expect(nodeAt(tree(), partial, { x: 100, y: 30 })).toBe("header")
  })

  it("takes a container it fully encloses, and not what is inside it", () => {
    // Selecting a container and its contents means a nudge moves them twice.
    const caught = nodesIn(tree(), rects, { x: 0, y: 100, width: 1440, height: 700 })

    expect(caught).toEqual(["body"])
  })

  it("looks inside a container it only touched", () => {
    // Sections fill the frame's width, so a box over one card touches the
    // section, the page and everything above them. A rule that selected those
    // would make nested content unselectable.
    expect(nodesIn(tree(), rects, { x: 140, y: 240, width: 140, height: 60 })).toEqual(["button"])
  })

  it("takes the deepest thing it reached when it enclosed nothing exactly", () => {
    expect(nodesIn(tree(), rects, { x: 90, y: 190, width: 50, height: 50 })).toEqual(["card"])
  })

  it("never takes the root, so a box over the background clears the selection", () => {
    expect(nodesIn(tree(), rects, { x: 0, y: 820, width: 100, height: 50 })).toEqual([])
  })

  it("catches siblings side by side", () => {
    const caught = nodesIn(tree(), rects, { x: 0, y: 0, width: 1440, height: 150 })

    expect(caught).toEqual(["header", "body"])
  })

  it("catches nothing where there is nothing", () => {
    expect(nodesIn(tree(), rects, { x: 2_000, y: 2_000, width: 10, height: 10 })).toEqual([])
  })
})

describe("what a click selects", () => {
  it("takes the outermost thing under the pointer first", () => {
    // So a user moving a whole section does not have to escape out of a button.
    expect(selectionFor(tree(), "button", [])).toEqual(["body"])
  })

  it("steps one level inward on the next click", () => {
    expect(selectionFor(tree(), "button", ["body"])).toEqual(["card"])
    expect(selectionFor(tree(), "button", ["card"])).toEqual(["button"])
  })

  it("stays on the leaf once it is reached", () => {
    expect(selectionFor(tree(), "button", ["button"])).toEqual(["button"])
  })

  it("clears the selection when the click hit nothing", () => {
    expect(selectionFor(tree(), null, ["button"])).toEqual([])
  })

  it("starts again from the outside when the click is elsewhere", () => {
    expect(selectionFor(tree(), "title", ["button"])).toEqual(["header"])
  })
})
