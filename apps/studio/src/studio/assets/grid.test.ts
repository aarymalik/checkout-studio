import { describe, expect, it } from "vitest"

import {
  CELL_GAP,
  LABEL_HEIGHT,
  MIN_CELL,
  cellAt,
  gridMetrics,
  gridWindow,
  neighbour,
} from "./grid"

/**
 * A grid of thumbnails, as rows a list can be windowed by.
 *
 * The arithmetic is separate from the panel so it can be tested without a
 * viewport, which is the only way to check what happens at a thousand assets
 * without rendering a thousand of anything.
 */

describe("how many columns fit", () => {
  it("is as many as the measured width holds", () => {
    expect(gridMetrics(10, 320).columns).toBe(3)
    expect(gridMetrics(10, 220).columns).toBe(2)
    expect(gridMetrics(10, 420).columns).toBe(4)
  })

  it("is never none, however narrow the panel is dragged", () => {
    // A zero would make the row count infinite, and a panel at its minimum
    // still has to show something.
    expect(gridMetrics(10, 0).columns).toBe(1)
    expect(gridMetrics(10, 40).columns).toBe(1)
  })

  it("spends the whole width rather than leaving a margin at the end", () => {
    const metrics = gridMetrics(10, 320)
    const used = metrics.cellWidth * metrics.columns + CELL_GAP * (metrics.columns - 1)

    expect(used).toBeLessThanOrEqual(320)
    expect(used).toBeGreaterThan(320 - metrics.columns)
  })

  it("never lays out wider than the panel, at any width it can be dragged to", () => {
    /*
     * Three widths prove three widths. The column count has to account for the
     * gaps between cells as well as the cells, and the arithmetic that forgets
     * them agrees at most widths and overflows at some — so this asks every
     * width between a collapsed panel and its maximum.
     *
     * The one exception is honest: below a single cell's width there is nothing
     * to lay out but one cell that does not fit.
     */
    for (let width = 80; width <= 440; width += 1) {
      const metrics = gridMetrics(50, width)
      const used = metrics.cellWidth * metrics.columns + CELL_GAP * (metrics.columns - 1)

      expect(used).toBeLessThanOrEqual(Math.max(width, MIN_CELL))
    }
  })

  it("never shrinks a cell below what a picture reads at", () => {
    expect(gridMetrics(10, 20).cellWidth).toBe(MIN_CELL)
  })

  it("makes a row a square cell, its label and the gap below", () => {
    const metrics = gridMetrics(10, 320)

    expect(metrics.rowHeight).toBe(metrics.cellWidth + LABEL_HEIGHT + CELL_GAP)
  })
})

describe("how many rows there are", () => {
  it("is the cells divided by the columns, rounded up", () => {
    expect(gridMetrics(7, 320).rows).toBe(3)
    expect(gridMetrics(9, 320).rows).toBe(3)
    expect(gridMetrics(0, 320).rows).toBe(0)
  })
})

describe("what gets rendered", () => {
  it("is a handful of rows out of a thousand assets", () => {
    /*
     * The target in docs/phases.md. A thousand thumbnails in the DOM is a
     * thousand image requests; what the panel renders is what fits in the
     * viewport and two rows either side of it.
     */
    const metrics = gridMetrics(1_000, 320)
    const view = gridWindow(metrics, 0, 600)

    expect(metrics.rows).toBe(334)
    expect(view.end - view.start).toBeLessThan(12)
  })

  it("keeps the scrollbar honest about what is not rendered", () => {
    const metrics = gridMetrics(1_000, 320)
    const view = gridWindow(metrics, 4_000, 600)

    expect(view.total).toBe(metrics.rows * metrics.rowHeight)
    expect(view.above + (view.end - view.start) * metrics.rowHeight + view.below).toBe(view.total)
  })

  it("renders from the top when there is nothing to scroll", () => {
    const view = gridWindow(gridMetrics(4, 320), 0, 600)

    expect(view.start).toBe(0)
    expect(view.above).toBe(0)
    expect(view.below).toBe(0)
  })

  it("renders nothing when there is nothing", () => {
    expect(gridWindow(gridMetrics(0, 320), 0, 600)).toMatchObject({ start: 0, end: 0, total: 0 })
  })
})

describe("where a cell is", () => {
  it("is its row and its column", () => {
    const metrics = gridMetrics(10, 320)

    expect(cellAt(metrics, 0)).toEqual({ row: 0, column: 0 })
    expect(cellAt(metrics, 2)).toEqual({ row: 0, column: 2 })
    expect(cellAt(metrics, 3)).toEqual({ row: 1, column: 0 })
    expect(cellAt(metrics, 7)).toEqual({ row: 2, column: 1 })
  })
})

describe("where an arrow key goes", () => {
  const metrics = gridMetrics(10, 320)

  it("moves along a row and onto the next", () => {
    expect(neighbour(metrics, 10, 0, "ArrowRight")).toBe(1)
    expect(neighbour(metrics, 10, 2, "ArrowRight")).toBe(3)
    expect(neighbour(metrics, 10, 3, "ArrowLeft")).toBe(2)
  })

  it("moves a whole row down and up", () => {
    expect(neighbour(metrics, 10, 1, "ArrowDown")).toBe(4)
    expect(neighbour(metrics, 10, 4, "ArrowUp")).toBe(1)
  })

  it("goes nowhere rather than wrapping", () => {
    /*
     * Clamping would move focus to the beginning of nothing. A reader at the
     * end of the list pressing right again should find focus where they left
     * it, not at the top.
     */
    expect(neighbour(metrics, 10, 9, "ArrowRight")).toBeNull()
    expect(neighbour(metrics, 10, 0, "ArrowLeft")).toBeNull()
    expect(neighbour(metrics, 10, 0, "ArrowUp")).toBeNull()
    expect(neighbour(metrics, 10, 9, "ArrowDown")).toBeNull()
  })

  it("goes down to the last cell when the row below is short", () => {
    // Ten cells in threes: the last row holds one. From index 7, down is off
    // the end, and stopping is the honest answer.
    expect(neighbour(metrics, 10, 7, "ArrowDown")).toBeNull()
    expect(neighbour(metrics, 10, 6, "ArrowDown")).toBe(9)
  })

  it("moves to the ends of the row, and not past the last cell", () => {
    expect(neighbour(metrics, 10, 5, "Home")).toBe(3)
    expect(neighbour(metrics, 10, 3, "End")).toBe(5)
    expect(neighbour(metrics, 10, 9, "End")).toBe(9)
  })

  it("ignores a key that is not a movement", () => {
    expect(neighbour(metrics, 10, 4, "Enter")).toBeNull()
    expect(neighbour(metrics, 10, 4, "a")).toBeNull()
  })
})
