import { describe, expect, it } from "vitest"

import { indicatorFor } from "../../src/dnd/indicator"
import type { Rect, Transform } from "../../src/canvas/transform"

/**
 * Where to draw the thing that says "here".
 *
 * docs/phases.md Phase 8 asks for the indicator's position maths at every zoom
 * level, which is the case that is easy to get wrong and impossible to see
 * going wrong: a line drawn in canvas space is 0.2px at 10% zoom and 8px at
 * 400%, so the geometry has to scale while the stroke does not.
 */

const BOX: Rect = { x: 100, y: 200, width: 300, height: 80 }
const AT_ONE: Transform = { zoom: 1, pan: { x: 0, y: 0 } }

describe("between siblings", () => {
  it("draws a line on the top edge for a drop before", () => {
    expect(indicatorFor(BOX, "before", AT_ONE)).toEqual({
      shape: "line",
      x: 100,
      y: 200,
      width: 300,
      height: 0,
    })
  })

  it("draws it on the bottom edge for a drop after", () => {
    // On the edge itself, not inside it. A line a pixel in reads as belonging
    // to the node rather than to the gap beside it.
    expect(indicatorFor(BOX, "after", AT_ONE)).toEqual({
      shape: "line",
      x: 100,
      y: 280,
      width: 300,
      height: 0,
    })
  })
})

describe("inside a container", () => {
  it("draws its outline rather than a line", () => {
    /*
     * There is no edge to point at. The answer is "in there", and a line drawn
     * somewhere inside the box would be a claim about which part of it.
     */
    expect(indicatorFor(BOX, "inside", AT_ONE)).toEqual({
      shape: "outline",
      x: 100,
      y: 200,
      width: 300,
      height: 80,
    })
  })
})

describe("at every zoom", () => {
  const CASES = [0.1, 0.25, 0.5, 1, 1.5, 2, 4]

  it("scales the geometry", () => {
    for (const zoom of CASES) {
      const line = indicatorFor(BOX, "after", { zoom, pan: { x: 0, y: 0 } })

      expect(line.x, `x at ${zoom}`).toBeCloseTo(100 * zoom)
      expect(line.y, `y at ${zoom}`).toBeCloseTo(280 * zoom)
      expect(line.width, `width at ${zoom}`).toBeCloseTo(300 * zoom)
    }
  })

  it("leaves the line's thickness alone, because it is not geometry", () => {
    for (const zoom of CASES) {
      // Zero means "a hairline, drawn by whatever draws it". A 2px line scaled
      // with the canvas is invisible when the user most needs it.
      expect(indicatorFor(BOX, "before", { zoom, pan: { x: 0, y: 0 } }).height).toBe(0)
    }
  })

  it("follows the pan", () => {
    const panned = indicatorFor(BOX, "before", { zoom: 2, pan: { x: 40, y: -30 } })

    expect(panned.x).toBeCloseTo(100 * 2 + 40)
    expect(panned.y).toBeCloseTo(200 * 2 - 30)
  })

  it("keeps an outline's proportions", () => {
    const outline = indicatorFor(BOX, "inside", { zoom: 0.5, pan: { x: 10, y: 10 } })

    expect(outline.width / outline.height).toBeCloseTo(300 / 80)
  })
})

describe("a node with no height", () => {
  it("puts before and after in the same place, which is where it is", () => {
    const flat: Rect = { x: 0, y: 50, width: 400, height: 0 }

    expect(indicatorFor(flat, "before", AT_ONE).y).toBe(50)
    expect(indicatorFor(flat, "after", AT_ONE).y).toBe(50)
  })
})
