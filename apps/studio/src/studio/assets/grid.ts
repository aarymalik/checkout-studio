import { windowFor } from "@checkout-studio/editor"
import type { Window } from "@checkout-studio/editor"

/**
 * A grid of thumbnails, as rows a list can be windowed by.
 *
 * The layers panel virtualizes a list; this virtualizes a grid, and the only
 * difference is arithmetic. A grid of `n` cells in `c` columns is `ceil(n / c)`
 * rows of a fixed height, which is a list again — so `windowFor` does the work
 * and nothing here reimplements it.
 *
 * Columns come from the panel's measured width rather than a breakpoint,
 * because the panel is a width the reader is dragging. See docs/phases.md
 * Phase 14, which holds the library to a thousand assets.
 */

/**
 * The narrowest a thumbnail is still worth looking at.
 *
 * Below this a logo is a smudge, and a grid of smudges is slower to read than
 * a shorter list of pictures. A property of the design, like the layers row's
 * height, which is why it is a number here rather than a token.
 */
export const MIN_CELL = 96

/** Between cells, matching the 8px ladder the rest of the Studio is on. */
export const CELL_GAP = 8

/** Under each cell, for one line of filename at the panel's text size. */
export const LABEL_HEIGHT = 18

export interface GridMetrics {
  columns: number
  /** Each cell's width, with the remainder spread rather than left at the end. */
  cellWidth: number
  /** A cell and its label and the gap below it. */
  rowHeight: number
  rows: number
}

export function gridMetrics(count: number, availableWidth: number): GridMetrics {
  /*
   * As many columns as fit, and never fewer than one. A panel at its minimum
   * width still has to show something, and a zero would make the row count
   * infinite.
   */
  const columns = Math.max(1, Math.floor((availableWidth + CELL_GAP) / (MIN_CELL + CELL_GAP)))
  const cellWidth = Math.max(
    MIN_CELL,
    Math.floor((availableWidth - CELL_GAP * (columns - 1)) / columns),
  )

  return {
    columns,
    cellWidth,
    // Square, so a grid of mixed shapes still reads as a grid; the picture
    // inside is fitted rather than cropped.
    rowHeight: cellWidth + LABEL_HEIGHT + CELL_GAP,
    rows: Math.ceil(count / columns),
  }
}

/** The rows to render, and the spacers that keep the scrollbar honest. */
export function gridWindow(metrics: GridMetrics, scrollTop: number, height: number): Window {
  return windowFor(metrics.rows, scrollTop, height, {
    rowHeight: metrics.rowHeight,
    // Fewer than a list's, because a row here is several pictures and each one
    // is a request. Two rows of margin is a flick of the wheel.
    overscan: 2,
  })
}

/** Where a cell is, so the keyboard can move between them by position. */
export function cellAt(metrics: GridMetrics, index: number): { row: number; column: number } {
  return { row: Math.floor(index / metrics.columns), column: index % metrics.columns }
}

/**
 * The cell the arrow keys move to, or null when there is nowhere to go.
 *
 * Null rather than clamping: a cell at the end of the last row has nothing to
 * its right, and moving focus to the beginning of nothing is worse than
 * leaving it where it is.
 */
export function neighbour(
  metrics: GridMetrics,
  count: number,
  index: number,
  key: string,
): number | null {
  const { row } = cellAt(metrics, index)

  switch (key) {
    case "ArrowRight":
      return index + 1 < count ? index + 1 : null
    case "ArrowLeft":
      return index > 0 ? index - 1 : null
    case "ArrowDown": {
      const below = index + metrics.columns

      return below < count ? below : null
    }
    case "ArrowUp": {
      const above = index - metrics.columns

      return above >= 0 ? above : null
    }
    case "Home":
      return row * metrics.columns
    case "End":
      return Math.min(row * metrics.columns + metrics.columns - 1, count - 1)
    default:
      return null
  }
}
