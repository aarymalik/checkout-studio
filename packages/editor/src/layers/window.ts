/**
 * Virtualization windowing.
 *
 * A 2,000-node page is 2,000 rows, and rendering them all costs a frame budget
 * the panel does not have — docs/phases.md holds it to 100ms. Only the rows in
 * view, plus a margin, are rendered; the rest is replaced by spacer height
 * above and below so the scrollbar still tells the truth.
 *
 * Rows are a fixed height, which is what makes the arithmetic a division rather
 * than a measured layout pass. A layers row is a single line of text at a fixed
 * size, so this is a property of the design rather than a simplification of it.
 */

/** One row, from docs/ui-guidelines.md's list density. */
export const ROW_HEIGHT = 28

/**
 * Rows rendered beyond each edge of the view.
 *
 * Enough that a flick of the wheel does not outrun the render. Too many and the
 * virtualization stops paying for itself; too few and the user sees white
 * bands.
 */
export const OVERSCAN = 8

export interface Window {
  /** First row to render. */
  start: number
  /** One past the last row to render. */
  end: number
  /** Spacer height above, in pixels. */
  above: number
  /** Spacer height below, in pixels. */
  below: number
  /** The full list's height, so the scroll container is the right size. */
  total: number
}

export interface WindowOptions {
  rowHeight?: number
  overscan?: number
}

export function windowFor(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  options: WindowOptions = {},
): Window {
  const rowHeight = options.rowHeight ?? ROW_HEIGHT
  const overscan = options.overscan ?? OVERSCAN
  const total = count * rowHeight

  if (count === 0) return { start: 0, end: 0, above: 0, below: 0, total: 0 }

  // A negative scrollTop happens during an overscroll bounce, and a viewport
  // with no height happens on the first render before layout.
  const top = Math.max(0, scrollTop)
  const height = Math.max(0, viewportHeight)

  const first = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const visible = Math.ceil(height / rowHeight)
  const last = Math.min(count, first + visible + overscan * 2)

  return {
    start: first,
    end: last,
    above: first * rowHeight,
    below: Math.max(0, (count - last) * rowHeight),
    total,
  }
}

/** Where to scroll so row `index` is in view, or null when it already is. */
export function scrollToRow(
  index: number,
  scrollTop: number,
  viewportHeight: number,
  options: WindowOptions = {},
): number | null {
  const rowHeight = options.rowHeight ?? ROW_HEIGHT
  const top = index * rowHeight
  const bottom = top + rowHeight

  if (top < scrollTop) return top
  if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight

  return null
}
