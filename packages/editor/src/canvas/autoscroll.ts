import type { Point, Rect } from "./transform"

/**
 * Auto-scroll near the canvas edges.
 *
 * Dragging a node towards the edge of the viewport pans the canvas, so a user
 * can move something past what is currently on screen without letting go.
 *
 * Velocity, not position: the caller runs a frame loop and applies whatever
 * this returns, so the speed is in pixels per second and does not depend on how
 * often the loop happens to run. A per-frame delta would move twice as fast on
 * a 120 Hz display.
 *
 * See docs/editor-behavior.md § Auto-scroll.
 */

/** How far from the edge the pull starts, in screen pixels. */
export const EDGE_ZONE = 64

/** Pixels per second at the very edge. */
export const MAX_SPEED = 1_200

export interface AutoScrollOptions {
  zone?: number
  maxSpeed?: number
  /**
   * How far the canvas may still travel in each direction.
   *
   * Without this the canvas keeps scrolling past the end of the page forever,
   * and the user who overshot has to drag all the way back.
   */
  remaining?: { left: number; right: number; up: number; down: number }
}

/**
 * How deep into the edge zone the pointer is, from 0 at the boundary to 1 at
 * the edge, squared.
 *
 * Squared because linear acceleration feels wrong in both directions at once:
 * it lurches as soon as you enter the zone, and it is still too slow when you
 * are pinned against the edge. A quadratic curve starts gently and ends fast,
 * which is what a user reaching for something off-screen expects.
 */
function pull(distance: number, zone: number): number {
  if (distance >= zone) return 0

  const depth = Math.min(1, Math.max(0, (zone - distance) / zone))

  return depth * depth
}

/**
 * The pan velocity for a pointer at `point` inside `viewport`, in pixels per
 * second. Both axes, either sign, zero when the pointer is clear of the edges.
 *
 * The sign is the direction the *content* moves: a pointer at the right edge
 * returns a negative x, because reaching right means pulling the page left.
 */
export function autoScrollVelocity(
  point: Point,
  viewport: Rect,
  options: AutoScrollOptions = {},
): Point {
  const zone = options.zone ?? EDGE_ZONE
  const speed = options.maxSpeed ?? MAX_SPEED
  const remaining = options.remaining

  // Measured from the viewport's own edges, so a canvas inset by rulers or a
  // panel pulls at the edge the user can see rather than the window's.
  const left = point.x - viewport.x
  const right = viewport.x + viewport.width - point.x
  const top = point.y - viewport.y
  const bottom = viewport.y + viewport.height - point.y

  const x = (pull(left, zone) - pull(right, zone)) * speed
  const y = (pull(top, zone) - pull(bottom, zone)) * speed

  if (remaining === undefined) return { x, y }

  return {
    x: limit(x, x > 0 ? remaining.left : remaining.right),
    y: limit(y, y > 0 ? remaining.up : remaining.down),
  }
}

/**
 * Clamps a signed velocity to the distance still available that way.
 *
 * Returns a plain zero rather than a negative one. `-0` behaves identically in
 * arithmetic and differently in `Object.is`, a snapshot and a debug readout,
 * which is a long afternoon for whoever meets it first.
 */
function limit(velocity: number, available: number): number {
  const magnitude = Math.min(Math.abs(velocity), available)

  return magnitude === 0 ? 0 : Math.sign(velocity) * magnitude
}

/** Whether the pointer is close enough to any edge to pull at all. */
export function isNearEdge(point: Point, viewport: Rect, zone: number = EDGE_ZONE): boolean {
  const velocity = autoScrollVelocity(point, viewport, { zone })

  return velocity.x !== 0 || velocity.y !== 0
}

/** The distance a velocity covers in one frame. */
export function stepFor(velocity: Point, elapsedMs: number): Point {
  const seconds = elapsedMs / 1_000

  return { x: velocity.x * seconds, y: velocity.y * seconds }
}
