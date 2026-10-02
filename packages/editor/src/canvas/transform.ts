/**
 * The two coordinate spaces, and how to get between them.
 *
 * **Canvas space** is the infinite plane the page sits on. A node's box is
 * measured here, and it does not change when the user pans or zooms — which is
 * the point: a selection overlay computed in canvas space stays correct through
 * any amount of navigation, and only its projection has to be recomputed.
 *
 * **Screen space** is pixels inside the viewport element, measured from its
 * top-left corner. Pointer events arrive here.
 *
 * ```
 * screen = canvas × zoom + pan
 * canvas = (screen − pan) ÷ zoom
 * ```
 *
 * Scale before translate, not after. The other order reads more naturally and
 * makes zoom-to-cursor wrong: the pan would scale with the zoom, so the point
 * under the cursor would drift away from it.
 *
 * See docs/editor-behavior.md § Canvas Zoom.
 */

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

export interface Transform {
  /** 0.1 to 4, per docs/editor-behavior.md. */
  zoom: number
  pan: Point
}

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 4
export const ZOOM_DEFAULT = 1

export const IDENTITY: Transform = { zoom: ZOOM_DEFAULT, pan: { x: 0, y: 0 } }

export function clampZoom(zoom: number): number {
  // NaN survives Math.min and Math.max — `Math.max(0.1, NaN)` is NaN — and a
  // NaN zoom turns every coordinate in the editor into NaN silently. A pinch
  // gesture that divides by a zero-distance touch pair produces exactly that.
  if (!Number.isFinite(zoom)) return ZOOM_DEFAULT

  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

export function toScreen(point: Point, transform: Transform): Point {
  return {
    x: point.x * transform.zoom + transform.pan.x,
    y: point.y * transform.zoom + transform.pan.y,
  }
}

export function toCanvas(point: Point, transform: Transform): Point {
  return {
    x: (point.x - transform.pan.x) / transform.zoom,
    y: (point.y - transform.pan.y) / transform.zoom,
  }
}

export function rectToScreen(rect: Rect, transform: Transform): Rect {
  const origin = toScreen(rect, transform)

  return {
    x: origin.x,
    y: origin.y,
    width: rect.width * transform.zoom,
    height: rect.height * transform.zoom,
  }
}

export function rectToCanvas(rect: Rect, transform: Transform): Rect {
  const origin = toCanvas(rect, transform)

  return {
    x: origin.x,
    y: origin.y,
    width: rect.width / transform.zoom,
    height: rect.height / transform.zoom,
  }
}

export function centreOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** The smallest rect containing all of them, or null for none. */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  const [first] = rects

  if (first === undefined) return null

  let left = first.x
  let top = first.y
  let right = first.x + first.width
  let bottom = first.y + first.height

  for (const rect of rects.slice(1)) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }

  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * Whether two rects overlap at all.
 *
 * Touching edges count as overlapping, which is what box selection should do:
 * a marquee dragged exactly to an element's edge has reached it, and telling
 * the user it has not is the kind of pixel argument nobody wins.
 */
export function intersects(left: Rect, right: Rect): boolean {
  return (
    left.x <= right.x + right.width &&
    right.x <= left.x + left.width &&
    left.y <= right.y + right.height &&
    right.y <= left.y + left.height
  )
}

/**
 * Whether two rects share any area.
 *
 * Stricter than `intersects`, which counts a graze. Selecting a node because a
 * marquee touched its boundary is wrong — a box dragged to the top of a section
 * would take the section above it — while a *guide* computed from a grazing
 * neighbour is perfectly reasonable. Two predicates, two jobs.
 *
 * A zero-extent box is the exception. A divider is 1440×0 and could never share
 * area with anything, so on an axis where the rect has no extent, being crossed
 * is enough.
 */
export function overlaps(rect: Rect, area: Rect): boolean {
  return (
    overlapsOn(rect.x, rect.x + rect.width, area.x, area.x + area.width) &&
    overlapsOn(rect.y, rect.y + rect.height, area.y, area.y + area.height)
  )
}

function overlapsOn(start: number, end: number, from: number, to: number): boolean {
  if (start === end) return from <= start && start <= to

  return start < to && from < end
}

/** Whether `inner` sits entirely inside `outer`. */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** The rect two points describe, whichever corner the drag started from. */
export function rectBetween(from: Point, to: Point): Rect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  }
}
