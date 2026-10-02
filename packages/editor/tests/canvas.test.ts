import { describe, expect, it } from "vitest"

import {
  EDGE_ZONE,
  FRAME_WIDTH,
  GRID_SIZE,
  IDENTITY,
  SNAP_THRESHOLD,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEPS,
  adjacentFrame,
  autoScrollVelocity,
  boundsOf,
  clampZoom,
  contains,
  containsPoint,
  frameRect,
  intersects,
  isNearEdge,
  overlaps,
  isZoomGesture,
  panBy,
  rectBetween,
  rectToCanvas,
  rectToScreen,
  resetViewport,
  snap,
  snapToGrid,
  stepFor,
  stepZoom,
  steppedZoom,
  toCanvas,
  toScreen,
  zoomAt,
  zoomBy,
  zoomFactorFor,
  zoomToFit,
  zoomToRect,
} from "../src/canvas"
import type { Rect, Transform } from "../src/canvas"

const VIEWPORT = { width: 1000, height: 800 }

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height }
}

describe("coordinate transforms", () => {
  it("is the identity at 100% with no pan", () => {
    expect(toScreen({ x: 40, y: 60 }, IDENTITY)).toEqual({ x: 40, y: 60 })
    expect(toCanvas({ x: 40, y: 60 }, IDENTITY)).toEqual({ x: 40, y: 60 })
  })

  it("scales before translating", () => {
    const transform: Transform = { zoom: 2, pan: { x: 100, y: 50 } }

    // The other order would make the pan scale with the zoom, and the point
    // under the cursor would drift away from it while zooming.
    expect(toScreen({ x: 10, y: 10 }, transform)).toEqual({ x: 120, y: 70 })
  })

  it("round-trips a point at every zoom level", () => {
    for (const zoom of ZOOM_STEPS) {
      const transform: Transform = { zoom, pan: { x: -317, y: 241 } }
      const point = { x: 123.5, y: -45.25 }
      const back = toCanvas(toScreen(point, transform), transform)

      expect(back.x, `x at ${zoom}`).toBeCloseTo(point.x, 6)
      expect(back.y, `y at ${zoom}`).toBeCloseTo(point.y, 6)
    }
  })

  it("round-trips a rect at every zoom level", () => {
    for (const zoom of ZOOM_STEPS) {
      const transform: Transform = { zoom, pan: { x: 77, y: -13 } }
      const original = rect(10, 20, 300, 400)
      const back = rectToCanvas(rectToScreen(original, transform), transform)

      expect(back.width, `width at ${zoom}`).toBeCloseTo(original.width, 6)
      expect(back.height, `height at ${zoom}`).toBeCloseTo(original.height, 6)
    }
  })

  it("clamps the zoom to the range the product offers", () => {
    expect(clampZoom(0.05)).toBe(ZOOM_MIN)
    expect(clampZoom(9)).toBe(ZOOM_MAX)
    expect(clampZoom(1.25)).toBe(1.25)
  })

  it("refuses a zoom that is not a number", () => {
    // NaN survives Math.min and Math.max, and a NaN zoom turns every coordinate
    // in the editor into NaN silently. A pinch over a zero-distance touch pair
    // produces exactly that.
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe("rect arithmetic", () => {
  it("finds the bounds of several rects", () => {
    expect(boundsOf([rect(10, 10, 20, 20), rect(50, 5, 10, 10)])).toEqual(rect(10, 5, 50, 25))
  })

  it("has no bounds for nothing", () => {
    expect(boundsOf([])).toBeNull()
  })

  it("has the rect itself as the bounds of one", () => {
    expect(boundsOf([rect(1, 2, 3, 4)])).toEqual(rect(1, 2, 3, 4))
  })

  it("tests a point against a rect, edges included", () => {
    const box = rect(10, 10, 100, 50)

    expect(containsPoint(box, { x: 50, y: 30 })).toBe(true)
    expect(containsPoint(box, { x: 10, y: 10 })).toBe(true)
    expect(containsPoint(box, { x: 110, y: 60 })).toBe(true)
    expect(containsPoint(box, { x: 9, y: 30 })).toBe(false)
    expect(containsPoint(box, { x: 50, y: 61 })).toBe(false)
  })

  it("counts touching rects as intersecting", () => {
    // A marquee dragged exactly to an element's edge has reached it, and
    // telling the user otherwise is a pixel argument nobody wins.
    expect(intersects(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(true)
    expect(intersects(rect(0, 0, 10, 10), rect(11, 0, 10, 10))).toBe(false)
    expect(intersects(rect(0, 0, 10, 10), rect(0, 11, 10, 10))).toBe(false)
    expect(intersects(rect(0, 0, 100, 100), rect(10, 10, 5, 5))).toBe(true)
  })

  it("requires shared area for selection, not a graze", () => {
    // A box dragged to the top of a section should not take the section above
    // it. Guides computed from a grazing neighbour are fine; selection is not.
    expect(overlaps(rect(0, 0, 10, 10), rect(0, 10, 10, 10))).toBe(false)
    expect(overlaps(rect(0, 0, 10, 10), rect(0, 9, 10, 10))).toBe(true)
    expect(overlaps(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false)
  })

  it("lets a zero-height node be caught by being crossed", () => {
    // A divider is 1440×0 and could never share area with anything.
    expect(overlaps(rect(0, 100, 1440, 0), rect(0, 50, 100, 100))).toBe(true)
    expect(overlaps(rect(0, 100, 1440, 0), rect(0, 150, 100, 100))).toBe(false)
    expect(overlaps(rect(100, 0, 0, 500), rect(50, 0, 100, 100))).toBe(true)
  })

  it("tests full containment separately", () => {
    expect(contains(rect(0, 0, 100, 100), rect(10, 10, 20, 20))).toBe(true)
    expect(contains(rect(0, 0, 100, 100), rect(90, 90, 20, 20))).toBe(false)
    expect(contains(rect(0, 0, 100, 100), rect(-1, 0, 10, 10))).toBe(false)
    expect(contains(rect(0, 0, 100, 100), rect(0, -1, 10, 10))).toBe(false)
  })

  it("builds a rect from two points, whichever corner came first", () => {
    expect(rectBetween({ x: 100, y: 80 }, { x: 20, y: 10 })).toEqual(rect(20, 10, 80, 70))
    expect(rectBetween({ x: 20, y: 10 }, { x: 100, y: 80 })).toEqual(rect(20, 10, 80, 70))
  })
})

describe("panning", () => {
  it("adds the delta and leaves the zoom alone", () => {
    expect(panBy({ zoom: 2, pan: { x: 10, y: 20 } }, { x: -5, y: 5 })).toEqual({
      zoom: 2,
      pan: { x: 5, y: 25 },
    })
  })
})

describe("zooming", () => {
  it("keeps the canvas point under the cursor fixed", () => {
    const before: Transform = { zoom: 1, pan: { x: 0, y: 0 } }
    const cursor = { x: 300, y: 200 }
    const anchor = toCanvas(cursor, before)

    const after = zoomAt(before, 2.5, cursor)

    // This is what makes wheel zoom feel like the page is under your fingers.
    expect(toScreen(anchor, after).x).toBeCloseTo(cursor.x, 6)
    expect(toScreen(anchor, after).y).toBeCloseTo(cursor.y, 6)
  })

  it("keeps it fixed when zooming out, and when already panned", () => {
    const before: Transform = { zoom: 2.5, pan: { x: -420, y: 137 } }
    const cursor = { x: 640, y: 480 }
    const anchor = toCanvas(cursor, before)

    const after = zoomBy(before, 0.5, cursor)

    expect(after.zoom).toBe(1.25)
    expect(toScreen(anchor, after).x).toBeCloseTo(cursor.x, 6)
    expect(toScreen(anchor, after).y).toBeCloseTo(cursor.y, 6)
  })

  it("clamps at both ends while still anchoring", () => {
    const cursor = { x: 100, y: 100 }

    expect(zoomAt({ zoom: 4, pan: { x: 0, y: 0 } }, 10, cursor).zoom).toBe(ZOOM_MAX)
    expect(zoomAt({ zoom: 0.1, pan: { x: 0, y: 0 } }, 0.01, cursor).zoom).toBe(ZOOM_MIN)
  })

  it("steps through named stops rather than multiplying", () => {
    // A fixed ratio per press lands on 113% and 127%, and a user who wants 100%
    // back has to hunt for it.
    expect(steppedZoom(1, 1)).toBe(1.25)
    expect(steppedZoom(1, -1)).toBe(0.75)
    expect(steppedZoom(1.1, 1)).toBe(1.25)
    expect(steppedZoom(1.1, -1)).toBe(1)
  })

  it("stays put at the ends of the range", () => {
    expect(steppedZoom(4, 1)).toBe(ZOOM_MAX)
    expect(steppedZoom(0.1, -1)).toBe(ZOOM_MIN)
    expect(steppedZoom(9, 1)).toBe(ZOOM_MAX)
  })

  it("anchors a stepped zoom too", () => {
    const after = stepZoom({ zoom: 1, pan: { x: 0, y: 0 } }, 1, { x: 500, y: 400 })

    expect(after.zoom).toBe(1.25)
    expect(toScreen({ x: 500, y: 400 }, after).x).toBeCloseTo(500, 6)
  })

  it("reads a pinch as a zoom, and a bare wheel as a scroll", () => {
    // A trackpad pinch arrives as a wheel event with ctrlKey set, which the
    // browser synthesises and no actual key was involved in.
    expect(isZoomGesture({ ctrlKey: true, metaKey: false })).toBe(true)
    expect(isZoomGesture({ ctrlKey: false, metaKey: true })).toBe(true)
    expect(isZoomGesture({ ctrlKey: false, metaKey: false })).toBe(false)
  })

  it("turns a wheel delta into a proportional factor", () => {
    // Exponential, so the same movement changes the zoom by the same proportion
    // wherever it starts.
    expect(zoomFactorFor(0)).toBe(1)
    expect(zoomFactorFor(-100)).toBeGreaterThan(1)
    expect(zoomFactorFor(100)).toBeLessThan(1)
    expect(zoomFactorFor(-100) * zoomFactorFor(100)).toBeCloseTo(1, 6)
  })
})

describe("fitting", () => {
  it("centres a page that already fits, without magnifying it", () => {
    const content = rect(0, 0, 390, 600)
    const transform = zoomToFit(content, VIEWPORT)

    // "Fit" never means "blow a short page up to fill the window".
    expect(transform.zoom).toBe(1)
    expect(toScreen({ x: 195, y: 300 }, transform)).toEqual({ x: 500, y: 400 })
  })

  it("shrinks a page that does not fit, leaving a margin", () => {
    const content = rect(0, 0, 1440, 2400)
    const transform = zoomToFit(content, VIEWPORT)

    expect(transform.zoom).toBeLessThan(1)
    expect(content.height * transform.zoom).toBeLessThanOrEqual(VIEWPORT.height)
    expect(content.width * transform.zoom).toBeLessThanOrEqual(VIEWPORT.width)
  })

  it("fits to whichever axis is tighter", () => {
    const wide = zoomToFit(rect(0, 0, 4000, 100), VIEWPORT)
    const tall = zoomToFit(rect(0, 0, 100, 4000), VIEWPORT)

    expect(wide.zoom).toBeCloseTo((1000 - 96) / 4000, 6)
    expect(tall.zoom).toBeCloseTo((800 - 96) / 4000, 6)
  })

  it("survives a page with no area, and a viewport with none", () => {
    expect(zoomToFit(rect(0, 0, 0, 0), VIEWPORT).zoom).toBe(1)
    expect(Number.isFinite(zoomToFit(rect(0, 0, 100, 100), { width: 0, height: 0 }).zoom)).toBe(
      true,
    )
  })

  it("does magnify when zooming to a selection", () => {
    // Unlike fit: the point of zooming to a selection is to see it closely.
    const transform = zoomToRect(rect(100, 100, 80, 40), VIEWPORT)

    expect(transform.zoom).toBeGreaterThan(1)
    expect(toScreen({ x: 140, y: 120 }, transform).x).toBeCloseTo(500, 6)
  })

  it("centres an empty selection at 100%", () => {
    expect(zoomToRect(rect(50, 50, 0, 0), VIEWPORT).zoom).toBe(1)
  })

  it("resets to 100%, centred", () => {
    const transform = resetViewport(rect(0, 0, 1440, 3000), VIEWPORT)

    expect(transform.zoom).toBe(1)
    expect(toScreen({ x: 720, y: 1500 }, transform)).toEqual({ x: 500, y: 400 })
  })
})

describe("device frames", () => {
  it("uses the widths the renderer's breakpoints come from", () => {
    expect(FRAME_WIDTH).toEqual({ desktop: 1440, tablet: 768, mobile: 390 })
  })

  it("takes its height from the content, never from the device", () => {
    // A checkout is as long as its content; a fixed height would crop the page
    // or invent whitespace below it.
    expect(frameRect("mobile", 2400)).toEqual(rect(0, 0, 390, 2400))
  })

  it("gives an empty page a frame to look at", () => {
    expect(frameRect("desktop", 0).height).toBe(1)
  })

  it("cycles through the frames in both directions", () => {
    expect(adjacentFrame("desktop", 1)).toBe("tablet")
    expect(adjacentFrame("mobile", 1)).toBe("desktop")
    expect(adjacentFrame("desktop", -1)).toBe("mobile")
  })
})

describe("snapping", () => {
  const sibling = rect(100, 100, 200, 100)

  it("snaps a near edge onto a sibling's", () => {
    const result = snap(rect(104, 300, 200, 100), [sibling])

    expect(result.rect.x).toBe(100)
    expect(result.guides.some((guide) => guide.axis === "x" && guide.kind === "edge")).toBe(true)
  })

  it("leaves a far edge alone", () => {
    const result = snap(rect(140, 300, 200, 100), [sibling])

    expect(result.rect.x).toBe(140)
    expect(result.guides).toEqual([])
  })

  it("snaps centres together, and calls it centring", () => {
    // Moving rect centre at 198+100=... placed so its centre is 3px from the
    // sibling's centre of 200.
    const result = snap(rect(97, 300, 200, 100), [sibling])

    expect(result.rect.x).toBe(100)
    const centre = result.guides.find((guide) => guide.kind === "centre")
    expect(centre?.position).toBe(200)
  })

  it("calls a centre meeting an edge an edge alignment", () => {
    // A centre landing on an edge is not centring as far as the user is
    // concerned, and labelling it so would draw the wrong kind of line.
    const result = snap(rect(2, 300, 200, 100), [sibling])

    expect(result.rect.x).toBe(0)
    expect(result.guides.every((guide) => guide.kind !== "centre")).toBe(true)
  })

  it("takes the nearest candidate when several are in range", () => {
    // Several lines within reach at once — edges and centres both. The
    // smallest move wins, which here is the two pixels onto the first
    // sibling's left edge rather than the three or four onto anything else.
    const result = snap(rect(98, 300, 10, 100), [rect(100, 0, 40, 40), rect(112, 0, 40, 40)])

    expect(result.rect.x).toBe(100)
  })

  it("draws every guide that agrees with where it landed", () => {
    // Three edges lining up at once should draw three lines, because that is
    // what the user achieved.
    const result = snap(rect(102, 400, 200, 100), [sibling, rect(100, 250, 200, 50)])

    expect(result.rect.x).toBe(100)
    expect(result.guides.filter((guide) => guide.axis === "x").length).toBeGreaterThan(1)
  })

  it("suggests the gap the page already uses", () => {
    // Two items 20px apart; the third wants the same gap.
    const first = rect(0, 0, 100, 50)
    const second = rect(120, 0, 100, 50)
    const result = snap(rect(238, 0, 100, 50), [first, second])

    expect(result.rect.x).toBe(240)
    expect(result.guides.some((guide) => guide.kind === "spacing")).toBe(true)
  })

  it("snaps to the grid when the grid is on", () => {
    const result = snap(rect(13, 300, 50, 50), [], { grid: true })

    expect(result.rect.x).toBe(16)
  })

  it("does not snap to the grid when it is off", () => {
    expect(snap(rect(13, 300, 50, 50), []).rect.x).toBe(13)
  })

  it("draws no guide for the grid, which is already drawn", () => {
    expect(snap(rect(13, 300, 50, 50), [], { grid: true }).guides).toEqual([])
  })

  it("does nothing at all when snapping is off", () => {
    const result = snap(rect(101, 100, 200, 100), [sibling], { enabled: false, grid: true })

    expect(result.rect.x).toBe(101)
    expect(result.guides).toEqual([])
  })

  it("takes the threshold from the caller, which divides by the zoom", () => {
    // A snap that felt right at 100% would be four times as grabby at 25%.
    expect(snap(rect(110, 300, 10, 10), [sibling], { threshold: 20 }).rect.x).toBe(100)
    expect(snap(rect(110, 300, 10, 10), [sibling], { threshold: 2 }).rect.x).toBe(110)
    expect(SNAP_THRESHOLD).toBe(6)
  })

  it("snaps both axes independently", () => {
    const result = snap(rect(103, 97, 200, 100), [sibling])

    expect(result.rect.x).toBe(100)
    expect(result.rect.y).toBe(100)
  })

  it("never changes the size of what it moves", () => {
    const result = snap(rect(103, 97, 200, 100), [sibling])

    expect(result.rect.width).toBe(200)
    expect(result.rect.height).toBe(100)
  })

  it("rounds a value onto the grid", () => {
    expect(snapToGrid(13)).toBe(16)
    expect(snapToGrid(11)).toBe(8)
    expect(snapToGrid(13, 10)).toBe(10)
    expect(GRID_SIZE).toBe(8)
  })

  it("has nothing to align to with no siblings", () => {
    expect(snap(rect(13, 17, 50, 50), []).rect).toEqual(rect(13, 17, 50, 50))
  })
})

describe("auto-scroll", () => {
  const viewport = rect(0, 0, 1000, 800)

  it("pulls nothing in the middle", () => {
    expect(autoScrollVelocity({ x: 500, y: 400 }, viewport)).toEqual({ x: 0, y: 0 })
    expect(isNearEdge({ x: 500, y: 400 }, viewport)).toBe(false)
  })

  it("pulls the page right when the pointer is at the left edge", () => {
    // The sign is the direction the content moves: reaching left pulls the page
    // right.
    const velocity = autoScrollVelocity({ x: 0, y: 400 }, viewport)

    expect(velocity.x).toBeGreaterThan(0)
    expect(velocity.y).toBe(0)
  })

  it("pulls the page left at the right edge, and up at the bottom", () => {
    expect(autoScrollVelocity({ x: 1000, y: 400 }, viewport).x).toBeLessThan(0)
    expect(autoScrollVelocity({ x: 500, y: 800 }, viewport).y).toBeLessThan(0)
    expect(autoScrollVelocity({ x: 500, y: 0 }, viewport).y).toBeGreaterThan(0)
  })

  it("accelerates as the pointer gets closer", () => {
    const outer = autoScrollVelocity({ x: EDGE_ZONE - 8, y: 400 }, viewport).x
    const inner = autoScrollVelocity({ x: 4, y: 400 }, viewport).x

    // Quadratic: gentle on entry, fast when pinned against the edge. Linear
    // lurches at the boundary and is still too slow at the edge.
    expect(inner).toBeGreaterThan(outer * 2)
  })

  it("stops pulling at the boundary of the zone", () => {
    expect(autoScrollVelocity({ x: EDGE_ZONE, y: 400 }, viewport).x).toBe(0)
  })

  it("pulls on both axes in a corner", () => {
    const velocity = autoScrollVelocity({ x: 2, y: 2 }, viewport)

    expect(velocity.x).toBeGreaterThan(0)
    expect(velocity.y).toBeGreaterThan(0)
    expect(isNearEdge({ x: 2, y: 2 }, viewport)).toBe(true)
  })

  it("measures from the viewport's own edges, not the window's", () => {
    const inset = rect(240, 32, 760, 768)

    expect(autoScrollVelocity({ x: 240, y: 400 }, inset).x).toBeGreaterThan(0)
    expect(autoScrollVelocity({ x: 100, y: 400 }, viewport).x).toBe(0)
  })

  it("stops at the bounds rather than scrolling into nothing", () => {
    const remaining = { left: 10, right: 0, up: 0, down: 5 }

    expect(autoScrollVelocity({ x: 0, y: 400 }, viewport, { remaining }).x).toBe(10)
    expect(autoScrollVelocity({ x: 1000, y: 400 }, viewport, { remaining }).x).toBe(0)
    expect(autoScrollVelocity({ x: 500, y: 0 }, viewport, { remaining }).y).toBe(0)
    expect(autoScrollVelocity({ x: 500, y: 800 }, viewport, { remaining }).y).toBe(-5)
  })

  it("takes a custom zone and speed", () => {
    expect(autoScrollVelocity({ x: 100, y: 400 }, viewport, { zone: 200 }).x).toBeGreaterThan(0)
    expect(autoScrollVelocity({ x: 0, y: 400 }, viewport, { maxSpeed: 100 }).x).toBeLessThanOrEqual(
      100,
    )
  })

  it("turns a velocity into a distance for one frame", () => {
    // Pixels per second, not per frame: a per-frame delta moves twice as fast
    // on a 120Hz display.
    expect(stepFor({ x: 600, y: -300 }, 16)).toEqual({ x: 9.6, y: -4.8 })
  })
})
