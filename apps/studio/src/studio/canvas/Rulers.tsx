"use client"

import type { Transform } from "@checkout-studio/editor"
import type { ReactElement } from "react"

/**
 * Rulers along the top and left edges.
 *
 * Marked in canvas pixels, not screen pixels, so a measurement read off the
 * ruler is the measurement that goes in the inspector. The spacing between
 * marks changes with the zoom instead: at 25% a mark every 10px would be
 * unreadable, so the interval grows until the labels have room.
 *
 * See docs/editor-behavior.md § Canvas.
 */

export const RULER_SIZE = 20

/** The candidate intervals, in canvas pixels. The first one wide enough wins. */
const INTERVALS = [10, 20, 50, 100, 200, 500, 1_000]

/** Smallest canvas interval whose marks are at least this far apart on screen. */
const MINIMUM_GAP = 60

export function intervalFor(zoom: number): number {
  return INTERVALS.find((interval) => interval * zoom >= MINIMUM_GAP) ?? 1_000
}

/** The marks visible along one axis, in canvas units with their screen positions. */
export function marksFor(
  transform: Transform,
  length: number,
  axis: "x" | "y",
): readonly { value: number; at: number }[] {
  const interval = intervalFor(transform.zoom)
  const offset = axis === "x" ? transform.pan.x : transform.pan.y
  const first = Math.floor(-offset / transform.zoom / interval) * interval
  const marks: { value: number; at: number }[] = []

  for (let value = first; ; value += interval) {
    const at = value * transform.zoom + offset

    if (at > length) break
    if (at >= 0) marks.push({ value, at })
  }

  return marks
}

export interface RulersProps {
  transform: Transform
  width: number
  height: number
}

export function Rulers({ transform, width, height }: RulersProps): ReactElement {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute left-0 top-0 border-b border-border bg-surface"
        style={{ width, height: RULER_SIZE }}
      >
        {marksFor(transform, width, "x").map((mark) => (
          <div key={mark.value} className="absolute top-0 h-full" style={{ left: mark.at }}>
            <div className="h-1.5 w-px bg-border-strong" />
            <span className="ml-1 text-tiny text-foreground-muted">{mark.value}</span>
          </div>
        ))}
      </div>

      <div
        className="absolute left-0 top-0 border-r border-border bg-surface"
        style={{ width: RULER_SIZE, height }}
      >
        {marksFor(transform, height, "y").map((mark) => (
          <div key={mark.value} className="absolute left-0 w-full" style={{ top: mark.at }}>
            <div className="h-px w-1.5 bg-border-strong" />
            {/*
              Rotated rather than stacked per digit. A vertical ruler's labels
              have to read in one direction, and rotating the whole number keeps
              it legible where a column of digits does not.
            */}
            <span className="ml-1 block origin-left rotate-90 text-tiny text-foreground-muted">
              {mark.value}
            </span>
          </div>
        ))}
      </div>

      {/* The corner, which belongs to neither ruler and would otherwise show the canvas through. */}
      <div
        className="absolute left-0 top-0 border-b border-r border-border bg-surface"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />
    </div>
  )
}
