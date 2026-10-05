import { edgesOf, type ResizeHandle } from "./resize"
import type { Rect } from "./transform"

/**
 * Snapping and alignment guides.
 *
 * One pass produces both: the adjusted position *and* the lines to draw, which
 * is the only way they can agree. Computing the snap in one place and the guide
 * in another is how a tool ends up showing a line the element did not land on.
 *
 * Everything here is canvas space, so the threshold is in canvas pixels and the
 * caller divides by the zoom first — a snap that felt right at 100% would be
 * four times as grabby at 25% otherwise.
 *
 * See docs/editor-behavior.md § Snapping and § Alignment Guides.
 */

/** How close, in canvas pixels, counts as aligned. */
export const SNAP_THRESHOLD = 6

/** The grid docs/editor-behavior.md specifies. */
export const GRID_SIZE = 8

export type GuideAxis = "x" | "y"

export interface Guide {
  axis: GuideAxis
  /** Where the line sits, in canvas space. */
  position: number
  /**
   * What it lined up with, so the overlay can draw the line only as far as it
   * needs to go rather than across the whole canvas.
   */
  span: { from: number; to: number }
  kind: "edge" | "centre" | "spacing"
}

export interface SnapResult {
  rect: Rect
  guides: readonly Guide[]
}

export interface SnapOptions {
  /** Off entirely when the user has turned snapping off. */
  enabled?: boolean
  /** Snap to the 8px grid as well as to siblings. */
  grid?: boolean
  threshold?: number
}

interface Candidate {
  /** Where the moving edge would land. */
  position: number
  /** How far it has to move to get there. */
  distance: number
  guide: Guide
}

/** The three lines an axis offers: both edges and the centre. */
function linesOf(rect: Rect, axis: GuideAxis): readonly { at: number; kind: Guide["kind"] }[] {
  const start = axis === "x" ? rect.x : rect.y
  const length = axis === "x" ? rect.width : rect.height

  return [
    { at: start, kind: "edge" },
    { at: start + length / 2, kind: "centre" },
    { at: start + length, kind: "edge" },
  ]
}

/** How far a rect extends on the *other* axis, for drawing the guide's length. */
function spanOf(a: Rect, b: Rect, axis: GuideAxis): { from: number; to: number } {
  const from = axis === "x" ? Math.min(a.y, b.y) : Math.min(a.x, b.x)
  const to =
    axis === "x" ? Math.max(a.y + a.height, b.y + b.height) : Math.max(a.x + a.width, b.x + b.width)

  return { from, to }
}

function candidatesOn(
  moving: Rect,
  targets: readonly Rect[],
  axis: GuideAxis,
  threshold: number,
): readonly Candidate[] {
  const candidates: Candidate[] = []
  const origin = axis === "x" ? moving.x : moving.y

  for (const target of targets) {
    for (const mine of linesOf(moving, axis)) {
      for (const theirs of linesOf(target, axis)) {
        const distance = theirs.at - mine.at

        if (Math.abs(distance) > threshold) continue

        candidates.push({
          position: origin + distance,
          distance,
          guide: {
            axis,
            position: theirs.at,
            span: spanOf(moving, target, axis),
            // A centre meeting an edge is still an edge alignment as far as the
            // user is concerned; only centre-to-centre reads as centring.
            kind: mine.kind === "centre" && theirs.kind === "centre" ? "centre" : "edge",
          },
        })
      }
    }
  }

  return candidates
}

/**
 * Equal-spacing candidates.
 *
 * The gap a user is really looking for: three items in a row, and the one being
 * moved wants the same distance from its neighbour as they have from each
 * other. Computed from the gaps already present between the targets, so it
 * suggests a rhythm the page established rather than one we invented.
 */
function spacingCandidatesOn(
  moving: Rect,
  targets: readonly Rect[],
  axis: GuideAxis,
  threshold: number,
): readonly Candidate[] {
  const start = (rect: Rect): number => (axis === "x" ? rect.x : rect.y)
  const end = (rect: Rect): number => (axis === "x" ? rect.x + rect.width : rect.y + rect.height)

  const ordered = [...targets].sort((left, right) => start(left) - start(right))
  const gaps = new Set<number>()

  for (let index = 1; index < ordered.length; index += 1) {
    const gap = start(ordered[index] as Rect) - end(ordered[index - 1] as Rect)

    if (gap > 0) gaps.add(Math.round(gap))
  }

  const candidates: Candidate[] = []
  const origin = start(moving)

  for (const gap of gaps) {
    for (const target of targets) {
      // After the target, and before it.
      for (const wanted of [
        end(target) + gap,
        start(target) - gap - (end(moving) - start(moving)),
      ]) {
        const distance = wanted - origin

        if (Math.abs(distance) > threshold) continue

        candidates.push({
          position: wanted,
          distance,
          guide: {
            axis,
            position: wanted,
            span: spanOf(moving, target, axis),
            kind: "spacing",
          },
        })
      }
    }
  }

  return candidates
}

function gridCandidateOn(moving: Rect, axis: GuideAxis, threshold: number): Candidate | null {
  const origin = axis === "x" ? moving.x : moving.y
  const snapped = Math.round(origin / GRID_SIZE) * GRID_SIZE
  const distance = snapped - origin

  if (Math.abs(distance) > threshold) return null

  // No guide line for the grid. The grid is already drawn, and a line on top of
  // one of its own cells says nothing.
  return {
    position: snapped,
    distance,
    guide: { axis, position: snapped, span: { from: 0, to: 0 }, kind: "edge" },
  }
}

function bestOn(
  moving: Rect,
  targets: readonly Rect[],
  axis: GuideAxis,
  options: Required<SnapOptions>,
): { position: number; guides: readonly Guide[] } | null {
  const candidates = [
    ...candidatesOn(moving, targets, axis, options.threshold),
    ...spacingCandidatesOn(moving, targets, axis, options.threshold),
    ...(options.grid ? [gridCandidateOn(moving, axis, options.threshold)] : []),
  ].filter((candidate): candidate is Candidate => candidate !== null)

  if (candidates.length === 0) return null

  const nearest = candidates.reduce((best, candidate) =>
    Math.abs(candidate.distance) < Math.abs(best.distance) ? candidate : best,
  )

  // Every guide that agrees with the winning position, not just the one that
  // won: three edges lining up at once should draw three lines, because that is
  // what the user has achieved.
  const agreeing = candidates
    .filter((candidate) => Math.abs(candidate.position - nearest.position) < 0.5)
    .map((candidate) => candidate.guide)
    .filter((guide) => guide.span.from !== guide.span.to)

  return { position: nearest.position, guides: agreeing }
}

/**
 * Snaps a moving rect against its siblings.
 *
 * `targets` is the caller's business and should be the *visible siblings* only:
 * guides against something scrolled out of view are noise, and guides against
 * every node on the page are both slow and meaningless.
 */
export function snap(
  moving: Rect,
  targets: readonly Rect[],
  options: SnapOptions = {},
): SnapResult {
  const settings = {
    enabled: options.enabled ?? true,
    grid: options.grid ?? false,
    threshold: options.threshold ?? SNAP_THRESHOLD,
  }

  if (!settings.enabled) return { rect: moving, guides: [] }

  const x = bestOn(moving, targets, "x", settings)
  const y = bestOn(moving, targets, "y", settings)

  return {
    rect: {
      x: x?.position ?? moving.x,
      y: y?.position ?? moving.y,
      width: moving.width,
      height: moving.height,
    },
    guides: [...(x?.guides ?? []), ...(y?.guides ?? [])],
  }
}

/** The nearest grid multiple. What a nudge with the grid on lands on. */
export function snapToGrid(value: number, size: number = GRID_SIZE): number {
  return Math.round(value / size) * size
}

/**
 * Snapping a resize.
 *
 * Different from snapping a move, and not a special case of it: a move slides a
 * rect of fixed size, so both of its edges are candidates and the whole thing
 * shifts. A resize holds the opposite edge still and moves one — so only the
 * dragged edge may snap, and what changes is the size rather than the position.
 *
 * Feeding a resized rect to `snap` would line its *left* edge up against a
 * sibling while the user was dragging its right, and move the box instead of
 * sizing it.
 *
 * See docs/editor-behavior.md § Alignment Guides.
 */
export function snapResize(
  rect: Rect,
  handle: ResizeHandle,
  targets: readonly Rect[],
  options: SnapOptions = {},
): SnapResult {
  const settings = {
    enabled: options.enabled ?? true,
    grid: options.grid ?? false,
    threshold: options.threshold ?? SNAP_THRESHOLD,
  }

  if (!settings.enabled) return { rect, guides: [] }

  const edges = edgesOf(handle)
  const horizontal = snapEdge(rect, targets, "x", edges.horizontal, settings)
  const vertical = snapEdge(rect, targets, "y", edges.vertical, settings)

  return {
    rect: {
      x: horizontal.start,
      y: vertical.start,
      width: horizontal.length,
      height: vertical.length,
    },
    guides: [...horizontal.guides, ...vertical.guides],
  }
}

/**
 * One axis of a resize snap.
 *
 * The anchored edge is the one the handle is not dragging, and it does not move
 * — so the snapped length is the distance from it to wherever the dragged edge
 * landed.
 */
function snapEdge(
  rect: Rect,
  targets: readonly Rect[],
  axis: GuideAxis,
  edge: "start" | "end" | null,
  settings: { grid: boolean; threshold: number },
): { start: number; length: number; guides: readonly Guide[] } {
  const start = axis === "x" ? rect.x : rect.y
  const length = axis === "x" ? rect.width : rect.height

  if (edge === null) return { start, length, guides: [] }

  const moving = edge === "start" ? start : start + length
  const anchored = edge === "start" ? start + length : start

  let best: { at: number; guide: Guide } | null = null

  for (const target of targets) {
    for (const theirs of linesOf(target, axis)) {
      const distance = Math.abs(theirs.at - moving)

      if (distance > settings.threshold) continue
      if (best !== null && distance >= Math.abs(best.at - moving)) continue

      best = {
        at: theirs.at,
        guide: {
          axis,
          position: theirs.at,
          kind: theirs.kind,
          span: spanOf(rect, target, axis),
        },
      }
    }
  }

  // The grid is the fallback, not a competitor: a sibling edge is a more useful
  // thing to line up with than an arbitrary multiple of eight.
  const landed = best?.at ?? (settings.grid ? snapToGrid(moving, GRID_SIZE) : moving)

  const next = Math.abs(anchored - landed)

  return {
    start: Math.min(anchored, landed),
    length: next,
    guides: best === null ? [] : [best.guide],
  }
}
