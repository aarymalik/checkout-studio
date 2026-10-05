import type { Point, Rect } from "./transform"

/**
 * Resizing by a handle.
 *
 * The geometry only: a rect, a grip, and how far the pointer moved, in canvas
 * units. No DOM, no store, no pointer events — which is what lets every case
 * that matters be written down as an example rather than performed with a mouse.
 *
 * See docs/editor-behavior.md § Resize.
 */

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export const RESIZE_HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

/**
 * The smallest a resize may leave something.
 *
 * One grid step. Smaller than this is a component nobody can grab again, and
 * zero is one somebody has effectively deleted by accident.
 */
export const MINIMUM_SIZE = 8

/** Which edge of each axis a handle drags, if any. */
export interface MovingEdges {
  /** "start" is the left edge, "end" the right. Null when the handle is vertical only. */
  horizontal: "start" | "end" | null
  /** "start" is the top edge, "end" the bottom. Null when the handle is horizontal only. */
  vertical: "start" | "end" | null
}

const EDGES: Record<ResizeHandle, MovingEdges> = {
  nw: { horizontal: "start", vertical: "start" },
  n: { horizontal: null, vertical: "start" },
  ne: { horizontal: "end", vertical: "start" },
  e: { horizontal: "end", vertical: null },
  se: { horizontal: "end", vertical: "end" },
  s: { horizontal: null, vertical: "end" },
  sw: { horizontal: "start", vertical: "end" },
  w: { horizontal: "start", vertical: null },
}

export function edgesOf(handle: ResizeHandle): MovingEdges {
  return EDGES[handle]
}

export interface ResizeOptions {
  minimum?: number
  /** Keep the original proportions. What holding shift does. */
  aspect?: boolean
}

/**
 * One axis of a resize.
 *
 * Returned rather than mutated so the two axes cannot interfere, and clamped at
 * the minimum rather than allowed to invert: dragging the left edge past the
 * right should stop, not turn the box inside out. The opposite edge never moves,
 * which is what makes a resize feel anchored.
 */
function axis(
  start: number,
  length: number,
  delta: number,
  edge: "start" | "end" | null,
  minimum: number,
): { start: number; length: number } {
  if (edge === null) return { start, length }

  if (edge === "end") {
    return { start, length: Math.max(minimum, length + delta) }
  }

  // Dragging the near edge moves the origin and the length in opposite
  // directions, and stops when the two would cross.
  const next = Math.max(minimum, length - delta)

  return { start: start + (length - next), length: next }
}

/**
 * The rect a drag from `handle` by `delta` produces.
 *
 * `delta` is in canvas units, not screen pixels — the caller divides by the
 * zoom, because a drag of ten screen pixels at 200% is five units of document.
 */
export function resizeRect(
  rect: Rect,
  handle: ResizeHandle,
  delta: Point,
  options: ResizeOptions = {},
): Rect {
  const minimum = options.minimum ?? MINIMUM_SIZE
  const edges = edgesOf(handle)

  const horizontal = axis(rect.x, rect.width, delta.x, edges.horizontal, minimum)
  const vertical = axis(rect.y, rect.height, delta.y, edges.vertical, minimum)

  const resized: Rect = {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.length,
    height: vertical.length,
  }

  return options.aspect === true ? withAspect(rect, resized, handle, minimum) : resized
}

/**
 * The same resize, holding the original proportions.
 *
 * The larger of the two changes wins, so a diagonal drag follows the pointer
 * rather than whichever axis happens to be first. A single-axis handle keeps its
 * proportions too — dragging the east edge of a square with shift held makes a
 * larger square, which is what every other editor does.
 */
function withAspect(original: Rect, resized: Rect, handle: ResizeHandle, minimum: number): Rect {
  // A zero-extent rect has no proportions to keep.
  if (original.width === 0 || original.height === 0) return resized

  const ratio = original.width / original.height
  const byWidth =
    Math.abs(resized.width - original.width) >= Math.abs(resized.height - original.height)

  const width = Math.max(minimum, byWidth ? resized.width : resized.height * ratio)
  const height = Math.max(minimum, byWidth ? resized.width / ratio : resized.height)

  const edges = edgesOf(handle)

  return {
    // The anchored edge stays put, so the box grows away from the grip.
    x: edges.horizontal === "start" ? original.x + original.width - width : resized.x,
    y: edges.vertical === "start" ? original.y + original.height - height : resized.y,
    width,
    height,
  }
}

/**
 * The size a resize should write, for the breakpoint being edited.
 *
 * Rounded, because a pointer produces fractions and nobody wants `width:
 * 302.9999999px` in their document.
 *
 * Only the axes the handle dragged, normally: resizing the east edge must not
 * write a height the user never set, which would freeze a box that was happily
 * sizing itself to its content.
 *
 * Holding the proportions is the exception, and has to be. Shift makes the
 * other axis move too, so writing one of them would hold the ratio on screen
 * during the drag and lose it the moment the pointer came up.
 */
export function resizeStyles(
  rect: Rect,
  handle: ResizeHandle,
  options: { aspect?: boolean } = {},
): { width?: number; height?: number } {
  const edges = options.aspect === true ? BOTH : edgesOf(handle)

  return {
    ...(edges.horizontal === null ? {} : { width: Math.round(rect.width) }),
    ...(edges.vertical === null ? {} : { height: Math.round(rect.height) }),
  }
}

/** Both axes, for a resize that moved both whatever its handle owns. */
const BOTH: MovingEdges = { horizontal: "end", vertical: "end" }
