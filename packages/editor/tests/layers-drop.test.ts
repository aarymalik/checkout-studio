import { describe, expect, it } from "vitest"

import { moveForRowDrop, rowAt, rowDropAt } from "../src/layers/drop"
import { ROW_HEIGHT } from "../src/layers/window"
import { flatten } from "../src/layers/tree"
import { documentOf } from "./documents"

/**
 * Where a drag in the layers panel would land.
 *
 * Arithmetic rather than measurement: a row is a fixed height by design, so the
 * row under the pointer is one division. These are the cases that decide
 * whether a drop reads as the user intended — the three bands within a row, and
 * the two ends of the list.
 */

/**
 * page
 *  ├── first
 *  ├── box ── inner
 *  └── last
 */
function rows() {
  const document = documentOf("page", [
    { id: "page", type: "core.page", children: ["first", "box", "last"] },
    { id: "first", type: "core.section" },
    { id: "box", type: "core.section", children: ["inner"] },
    { id: "inner", type: "core.text" },
    { id: "last", type: "core.section" },
  ])

  return flatten(document, new Set(["page", "box"]))
}

/** The y of a point a given fraction into row `index`. */
const at = (index: number, fraction: number): number => index * ROW_HEIGHT + ROW_HEIGHT * fraction

describe("which row the pointer is over", () => {
  it("is one division, because rows are a fixed height", () => {
    const list = rows()

    expect(rowAt(list, at(0, 0.5))?.id).toBe("page")
    expect(rowAt(list, at(2, 0.5))?.id).toBe("box")
  })

  it("clamps past the ends rather than refusing", () => {
    const list = rows()

    // Dragging below a short list is the ordinary way to reach the end, and
    // "the end" is a place.
    expect(rowAt(list, 10_000)?.id).toBe(list[list.length - 1]?.id)
    expect(rowAt(list, -40)?.id).toBe("page")
  })

  it("answers nothing for an empty list", () => {
    expect(rowAt([], 0)).toBeNull()
  })
})

describe("the three bands in a row", () => {
  it("reads the top as before it", () => {
    const drop = rowDropAt(rows(), at(1, 0.1))

    expect(drop).toEqual({ overId: "first", position: "before", parentId: "page", index: 0 })
  })

  it("reads the bottom as after it", () => {
    const drop = rowDropAt(rows(), at(1, 0.9))

    expect(drop).toEqual({ overId: "first", position: "after", parentId: "page", index: 1 })
  })

  it("reads the middle of a container as inside it, first", () => {
    const drop = rowDropAt(rows(), at(2, 0.5))

    /*
     * First rather than appended. Dropping onto a container in a tree means
     * "put it in there", and the first position is the one whose result the
     * user can see without scrolling.
     */
    expect(drop).toEqual({ overId: "box", position: "inside", parentId: "box", index: 0 })
  })

  it("falls back to a side for something that takes no children", () => {
    const drop = rowDropAt(rows(), at(2, 0.5), { canHaveChildren: () => false })

    expect(drop?.position).toBe("after")
    expect(drop?.parentId).toBe("page")
  })
})

describe("the root row", () => {
  it("has no before and no after", () => {
    // "Before the page" is not a place. Inside it is the nearest thing the user
    // can have meant.
    expect(rowDropAt(rows(), at(0, 0.05))).toEqual({
      overId: "page",
      position: "inside",
      parentId: "page",
      index: 0,
    })
  })
})

describe("indexing", () => {
  it("counts against the children as they are, dragged row included", () => {
    const list = rows()
    // `inner` is box's only child, at index 0.
    const before = rowDropAt(list, at(3, 0.1))
    const after = rowDropAt(list, at(3, 0.9))

    /*
     * `move` reads the target index against the children *before* the node is
     * lifted out — its own comment says so — so adjusting for the dragged row
     * here would land the drop one short.
     */
    expect(before).toEqual({ overId: "inner", position: "before", parentId: "box", index: 0 })
    expect(after).toEqual({ overId: "inner", position: "after", parentId: "box", index: 1 })
  })

  it("reaches the end of the list", () => {
    const list = rows()
    const drop = rowDropAt(list, at(list.length - 1, 0.9))

    expect(drop?.position).toBe("after")
    expect(drop?.parentId).toBe("page")
  })
})

describe("an empty panel", () => {
  it("has nowhere to drop", () => {
    expect(rowDropAt([], 0)).toBeNull()
  })
})

describe("the move it describes", () => {
  it("is the two values the store takes", () => {
    const drop = rowDropAt(rows(), at(1, 0.9))

    if (drop === null) throw new Error("It should have resolved.")

    expect(moveForRowDrop("inner", drop)).toEqual({
      id: "inner",
      parentId: "page",
      index: 1,
    })
  })
})
