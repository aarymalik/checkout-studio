import { describe, expect, it } from "vitest"

import { describeDrag, indicatorTarget, pickUp, stepDrag } from "../../src/dnd/keyboard"
import { documentOf } from "../documents"

/**
 * Dragging with the keyboard.
 *
 * docs/keyboard-shortcuts.md § Keyboard drag and drop. Phase 8's exit criteria
 * require the whole of it, announced: a canvas where the only way to move
 * something is to hold a button down is a canvas some people cannot use.
 *
 * Pure, so every case is an example. The ones worth writing down are the ends
 * — a key pressed once too often has to do nothing rather than drop what is
 * being carried — and what the announcement says, because a position is only
 * meaningful relative to something the user already knows about.
 */

/**
 * page
 *  ├── first  (Hero)
 *  ├── box    (Box) ── inner (Inner)
 *  ├── locked (Footer, locked)
 *  └── last   (Last)
 */
function tree() {
  return documentOf("page", [
    { id: "page", type: "core.page", children: ["first", "box", "locked", "last"], name: "Page" },
    { id: "first", type: "core.section", name: "Hero" },
    { id: "box", type: "core.section", children: ["inner"], name: "Box" },
    { id: "inner", type: "core.text", name: "Inner" },
    { id: "locked", type: "core.section", locked: true, name: "Footer" },
    { id: "last", type: "core.section", name: "Last" },
  ])
}

describe("picking a node up", () => {
  it("starts where the node already is", () => {
    const drag = pickUp(tree(), "first")

    expect(drag).toMatchObject({ id: "first", parentId: "page", index: 0, steps: 0 })
  })

  it("refuses the page, which cannot be moved", () => {
    expect(pickUp(tree(), "page")).toBeNull()
  })

  it("refuses a locked node, before anything lifts", () => {
    // Asked here rather than after the user has carried it somewhere, which is
    // the same rule the pointer drag applies.
    expect(pickUp(tree(), "locked")).toBeNull()
  })

  it("refuses a node that is not there", () => {
    expect(pickUp(tree(), "ghost")).toBeNull()
  })
})

describe("stepping", () => {
  it("moves down through the siblings", () => {
    const drag = pickUp(tree(), "first")

    if (drag === null) throw new Error("It should have lifted.")

    // Into `box`, which can hold children — the same rule the layers panel's
    // reorder follows, because it is the same function.
    const next = stepDrag(drag, "down")

    expect(next.parentId).toBe("box")
    expect(next.steps).toBe(1)
  })

  it("moves back up again", () => {
    const drag = pickUp(tree(), "last")

    if (drag === null) throw new Error("It should have lifted.")

    const up = stepDrag(drag, "up")

    expect(up.index).toBeLessThan(3)
    expect(stepDrag(up, "down").index).toBe(3)
  })

  it("goes into the sibling above, and back out", () => {
    // `locked` sits between `box` and `last`, so stepping in from `locked`'s
    // position is what reaches `box` — and `locked` itself refuses, which the
    // test below is about.
    const drag = pickUp(tree(), "locked")

    expect(drag).toBeNull()

    const other = pickUp(tree(), "last")

    if (other === null) throw new Error("It should have lifted.")

    // Up past `locked` first, so the sibling above is `box`, which accepts.
    const above = stepDrag(other, "up")
    const inside = stepDrag(above, "in")

    expect(inside.parentId).toBe("box")
    expect(stepDrag(inside, "out").parentId).toBe("page")
  })

  it("does nothing at the ends rather than dropping what is carried", () => {
    const drag = pickUp(tree(), "first")

    if (drag === null) throw new Error("It should have lifted.")

    // Already first in the root: there is nowhere above and no grandparent.
    const up = stepDrag(drag, "up")

    expect(up).toBe(drag)
    expect(up.steps).toBe(0)

    // And out of the root, which is not a place.
    expect(stepDrag(drag, "out")).toBe(drag)
  })

  it("will not step into something locked", () => {
    const drag = pickUp(tree(), "last")

    if (drag === null) throw new Error("It should have lifted.")

    const rules = { canHaveChildren: () => true }
    const inside = stepDrag(drag, "in", rules)

    // `locked` is the sibling above, and it is locked — so stepping in is
    // refused and the drag stays put rather than landing somewhere forbidden.
    expect(inside.parentId).not.toBe("locked")
  })

  it("will not step into something that takes no children", () => {
    const drag = pickUp(tree(), "last")

    if (drag === null) throw new Error("It should have lifted.")

    const stuck = stepDrag(drag, "in", { canHaveChildren: () => false })

    expect(stuck).toBe(drag)
  })

  it("hands the caller's rules to the engine, not just to the check", () => {
    const drag = pickUp(tree(), "first")

    if (drag === null) throw new Error("It should have lifted.")

    const asked: string[] = []
    const next = stepDrag(drag, "down", {
      canHaveChildren: (node) => {
        asked.push(node.id)

        return true
      },
    })

    // The step succeeds, so the move is actually performed — which is the only
    // path on which the rules reach `move` rather than stopping at
    // `dropRejection`.
    expect(next.parentId).toBe("box")
    expect(asked).toContain("box")
  })

  it("walks the whole tree with repeated presses", () => {
    let drag = pickUp(tree(), "first")

    if (drag === null) throw new Error("It should have lifted.")

    const seen = new Set<string>()

    // "Every valid position" is reachable by stepping, which is what holding
    // the move as a document rather than as a plan buys: each step is computed
    // from where the node would now be.
    for (let press = 0; press < 12; press += 1) {
      drag = stepDrag(drag, "down")
      seen.add(`${drag.parentId}:${drag.index}`)
    }

    expect(seen.size).toBeGreaterThan(3)
  })

  it("never writes to the document it was given", () => {
    const document = tree()
    const drag = pickUp(document, "first")

    if (drag === null) throw new Error("It should have lifted.")

    stepDrag(drag, "down")

    // Nothing is committed until the drop, which is why cancelling is not an
    // undo: there is nothing to undo.
    expect(document.nodes["page"]?.children).toEqual(["first", "box", "locked", "last"])
  })
})

describe("where to draw the indicator", () => {
  it("points after the sibling above, which reads as a destination", () => {
    const drag = pickUp(tree(), "box")

    if (drag === null) throw new Error("It should have lifted.")

    expect(indicatorTarget(drag)).toEqual({ overId: "first", position: "after" })
  })

  it("points before the next one when there is nothing above", () => {
    const drag = pickUp(tree(), "first")

    if (drag === null) throw new Error("It should have lifted.")

    expect(indicatorTarget(drag)).toEqual({ overId: "box", position: "before" })
  })

  it("points at the container when it would be alone in there", () => {
    const drag = pickUp(tree(), "inner")

    if (drag === null) throw new Error("It should have lifted.")

    expect(indicatorTarget(drag)).toEqual({ overId: "box", position: "inside" })
  })

  it("answers nothing for a parent that is not there", () => {
    const drag = pickUp(tree(), "first")

    if (drag === null) throw new Error("It should have lifted.")

    expect(indicatorTarget({ ...drag, parentId: "ghost" })).toBeNull()
  })

  it("answers nothing when the node is not among its parent's children", () => {
    const drag = pickUp(tree(), "first")

    if (drag === null) throw new Error("It should have lifted.")

    expect(indicatorTarget({ ...drag, id: "ghost" })).toBeNull()
  })
})

describe("what is announced", () => {
  it("names the neighbour and the container, not an index", () => {
    const drag = pickUp(tree(), "last")

    if (drag === null) throw new Error("It should have lifted.")

    /*
     * "after Footer, in Page" tells somebody where they are. "index 3" does
     * not, and a position is only meaningful relative to something the user
     * already knows about.
     */
    expect(describeDrag(drag)).toBe("Last, after Footer, in Page")
  })

  it("describes where a step would put it", () => {
    const drag = pickUp(tree(), "last")

    if (drag === null) throw new Error("It should have lifted.")

    // Read from the provisional document, so the neighbours named are the
    // neighbours it would actually have.
    expect(describeDrag(stepDrag(drag, "up"))).toBe("Last, after Box, in Page")
  })

  it("says when it would be the only thing in there", () => {
    const drag = pickUp(tree(), "inner")

    if (drag === null) throw new Error("It should have lifted.")

    // `inner` is `box`'s only child, so there is no sibling to point at.
    expect(describeDrag(drag)).toBe("Inner, into Box, on its own")
  })

  it("takes the caller's name for a node", () => {
    const drag = pickUp(tree(), "last")

    if (drag === null) throw new Error("It should have lifted.")

    expect(describeDrag(drag, { nameOf: () => "the thing" })).toBe(
      "the thing, after the thing, in the thing",
    )
  })

  it("falls back to the id when a node has no name", () => {
    const bare = documentOf("page", [
      { id: "page", type: "core.page", children: ["one", "two"] },
      { id: "one", type: "core.section" },
      { id: "two", type: "core.section" },
    ])
    const drag = pickUp(bare, "two")

    if (drag === null) throw new Error("It should have lifted.")

    expect(describeDrag(drag)).toBe("two, after one, in page")
  })

  it("says so when there is nowhere to put it", () => {
    const drag = pickUp(tree(), "last")

    if (drag === null) throw new Error("It should have lifted.")

    expect(describeDrag({ ...drag, parentId: "ghost" })).toBe("Last, nowhere to put it")
  })

  it("describes a position before a sibling", () => {
    const drag = pickUp(tree(), "first")

    if (drag === null) throw new Error("It should have lifted.")

    // First in the row, so there is nothing above it to be after.
    expect(describeDrag(drag)).toBe("Hero, before Box, in Page")
  })
})
