import { describe, expect, it } from "vitest"

import {
  MINIMUM_SIZE,
  RESIZE_HANDLES,
  edgesOf,
  resizeRect,
  resizeStyles,
} from "../../src/canvas/resize"
import { snapResize } from "../../src/canvas/snap"
import type { Rect } from "../../src/canvas/transform"

/**
 * Resizing by a handle.
 *
 * Pure geometry, so every case that matters is an example rather than something
 * performed with a mouse. The ones worth writing down are the awkward ones: the
 * near edge, which moves the origin as well as the size, and the limit, where a
 * drag has to stop rather than turn the box inside out.
 */

const BOX: Rect = { x: 100, y: 100, width: 200, height: 100 }

describe("which edges a handle moves", () => {
  it("moves one axis for a side and both for a corner", () => {
    expect(edgesOf("e")).toEqual({ horizontal: "end", vertical: null })
    expect(edgesOf("n")).toEqual({ horizontal: null, vertical: "start" })
    expect(edgesOf("sw")).toEqual({ horizontal: "start", vertical: "end" })
  })

  it("has an entry for every handle the overlay draws", () => {
    expect(RESIZE_HANDLES).toHaveLength(8)

    for (const handle of RESIZE_HANDLES) {
      const edges = edgesOf(handle)

      // Never both null: a handle that moves nothing is a handle that lies.
      expect(edges.horizontal !== null || edges.vertical !== null).toBe(true)
    }
  })
})

describe("dragging the far edge", () => {
  it("grows the size and leaves the origin alone", () => {
    expect(resizeRect(BOX, "e", { x: 40, y: 0 })).toEqual({
      x: 100,
      y: 100,
      width: 240,
      height: 100,
    })
  })

  it("shrinks it when dragged back", () => {
    expect(resizeRect(BOX, "s", { x: 0, y: -30 })).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 70,
    })
  })

  it("ignores movement on the axis it does not own", () => {
    // Dragging the east handle up and down must not change the height, or a
    // slightly wobbly horizontal drag writes a height nobody asked for.
    expect(resizeRect(BOX, "e", { x: 40, y: 500 })).toEqual({
      x: 100,
      y: 100,
      width: 240,
      height: 100,
    })
  })
})

describe("dragging the near edge", () => {
  it("moves the origin and the size in opposite directions", () => {
    // The right edge stays at 300 throughout, which is what makes a resize feel
    // anchored rather than like a drag.
    expect(resizeRect(BOX, "w", { x: -50, y: 0 })).toEqual({
      x: 50,
      y: 100,
      width: 250,
      height: 100,
    })
  })

  it("keeps the opposite edge still when shrinking too", () => {
    const resized = resizeRect(BOX, "n", { x: 0, y: 40 })

    expect(resized).toEqual({ x: 100, y: 140, width: 200, height: 60 })
    expect(resized.y + resized.height).toBe(BOX.y + BOX.height)
  })
})

describe("corners", () => {
  it("move both axes at once", () => {
    expect(resizeRect(BOX, "se", { x: 20, y: 30 })).toEqual({
      x: 100,
      y: 100,
      width: 220,
      height: 130,
    })
  })

  it("anchor the opposite corner", () => {
    const resized = resizeRect(BOX, "nw", { x: -20, y: -30 })

    expect(resized).toEqual({ x: 80, y: 70, width: 220, height: 130 })
    expect(resized.x + resized.width).toBe(BOX.x + BOX.width)
    expect(resized.y + resized.height).toBe(BOX.y + BOX.height)
  })
})

describe("the limit", () => {
  it("stops at the minimum rather than inverting", () => {
    // Dragging the left edge far past the right should stop, not turn the box
    // inside out — a negative width is not a smaller box, it is a broken one.
    const resized = resizeRect(BOX, "w", { x: 10_000, y: 0 })

    expect(resized.width).toBe(MINIMUM_SIZE)
    expect(resized.x + resized.width).toBe(BOX.x + BOX.width)
  })

  it("never produces a negative size from any handle", () => {
    for (const handle of RESIZE_HANDLES) {
      const resized = resizeRect(BOX, handle, { x: -10_000, y: -10_000 })

      expect(resized.width).toBeGreaterThanOrEqual(MINIMUM_SIZE)
      expect(resized.height).toBeGreaterThanOrEqual(MINIMUM_SIZE)
    }
  })

  it("takes a caller's own minimum", () => {
    expect(resizeRect(BOX, "e", { x: -10_000, y: 0 }, { minimum: 40 }).width).toBe(40)
  })
})

describe("holding the proportions", () => {
  it("follows the larger of the two changes", () => {
    // 2:1 to begin with. A mostly-horizontal drag should follow the width.
    const resized = resizeRect(BOX, "se", { x: 100, y: 5 }, { aspect: true })

    expect(resized.width / resized.height).toBeCloseTo(2)
    expect(resized.width).toBe(300)
  })

  it("keeps a single-axis handle proportional too", () => {
    const resized = resizeRect(BOX, "e", { x: 100, y: 0 }, { aspect: true })

    expect(resized.width).toBe(300)
    expect(resized.height).toBe(150)
  })

  it("still anchors the opposite edge", () => {
    const resized = resizeRect(BOX, "nw", { x: -100, y: 0 }, { aspect: true })

    expect(resized.x + resized.width).toBe(BOX.x + BOX.width)
    expect(resized.y + resized.height).toBe(BOX.y + BOX.height)
  })

  it("leaves a zero-extent rect alone, having no proportions to keep", () => {
    const flat: Rect = { x: 0, y: 0, width: 0, height: 50 }

    expect(resizeRect(flat, "e", { x: 20, y: 0 }, { aspect: true }).width).toBe(20)
  })
})

describe("what gets written", () => {
  it("writes only the axes the handle dragged", () => {
    // Resizing the east edge must not write a height: that would freeze a box
    // which was happily sizing itself to its content.
    expect(resizeStyles({ x: 0, y: 0, width: 240, height: 100 }, "e")).toEqual({ width: 240 })
    expect(resizeStyles({ x: 0, y: 0, width: 240, height: 100 }, "s")).toEqual({ height: 100 })
  })

  it("writes both axes when the proportions were held", () => {
    // Shift moves the other axis too, so writing one of them would hold the
    // ratio during the drag and lose it the moment the pointer came up.
    expect(resizeStyles({ x: 0, y: 0, width: 300, height: 150 }, "e", { aspect: true })).toEqual({
      width: 300,
      height: 150,
    })
  })

  it("writes both for a corner", () => {
    expect(resizeStyles({ x: 0, y: 0, width: 240, height: 130 }, "se")).toEqual({
      width: 240,
      height: 130,
    })
  })

  it("rounds, because a pointer produces fractions", () => {
    expect(resizeStyles({ x: 0, y: 0, width: 302.9999, height: 99.4 }, "se")).toEqual({
      width: 303,
      height: 99,
    })
  })
})

describe("snapping a resize", () => {
  /** A sibling whose left edge sits at 360. */
  const sibling: Rect = { x: 360, y: 100, width: 100, height: 100 }

  it("lines the dragged edge up with a sibling", () => {
    // Dragged to 356, four away from the sibling's edge at 360.
    const dragged: Rect = { x: 100, y: 100, width: 256, height: 100 }
    const result = snapResize(dragged, "e", [sibling])

    expect(result.rect.width).toBe(260)
    expect(result.rect.x).toBe(100)
    expect(result.guides).toHaveLength(1)
    expect(result.guides[0]?.position).toBe(360)
  })

  it("changes the size, not the position", () => {
    const dragged: Rect = { x: 100, y: 100, width: 256, height: 100 }
    const result = snapResize(dragged, "e", [sibling])

    /*
     * The difference from snapping a move, and the reason this exists. Feeding
     * a resized rect to `snap` would line its *left* edge up against the
     * sibling while the user was dragging its right, and slide the box instead
     * of sizing it.
     */
    expect(result.rect.x).toBe(dragged.x)
  })

  it("snaps the near edge without moving the far one", () => {
    const dragged: Rect = { x: 356, y: 100, width: 200, height: 100 }
    const result = snapResize(dragged, "w", [sibling])

    expect(result.rect.x).toBe(360)
    expect(result.rect.x + result.rect.width).toBe(dragged.x + dragged.width)
  })

  it("leaves an edge alone when nothing is near it", () => {
    const dragged: Rect = { x: 100, y: 100, width: 50, height: 100 }
    const result = snapResize(dragged, "e", [sibling])

    expect(result.rect).toEqual(dragged)
    expect(result.guides).toEqual([])
  })

  it("does nothing at all when snapping is off", () => {
    const dragged: Rect = { x: 100, y: 100, width: 256, height: 100 }
    const result = snapResize(dragged, "e", [sibling], { enabled: false })

    expect(result.rect).toEqual(dragged)
    expect(result.guides).toEqual([])
  })

  it("falls back to the grid, and prefers a sibling to it", () => {
    const dragged: Rect = { x: 0, y: 0, width: 101, height: 100 }

    // Nothing near: the grid takes it.
    expect(snapResize(dragged, "e", [], { grid: true }).rect.width).toBe(104)

    // A sibling edge is a more useful thing to line up with than a multiple of
    // eight, so it wins when both are in range.
    const near: Rect = { x: 103, y: 0, width: 10, height: 10 }

    expect(snapResize(dragged, "e", [near], { grid: true }).rect.width).toBe(103)
  })

  it("does not snap the axis the handle does not own", () => {
    const dragged: Rect = { x: 100, y: 96, width: 200, height: 100 }
    // A sibling whose top edge is at 100, four from this rect's top.
    const result = snapResize(dragged, "e", [{ x: 400, y: 100, width: 10, height: 10 }])

    // The east handle owns no vertical edge, so the top must not move.
    expect(result.rect.y).toBe(96)
    expect(result.rect.height).toBe(100)
  })
})
