"use client"

import { rectToScreen, type Guide, type NodeRects, type Transform } from "@checkout-studio/editor"
import type { ReactElement } from "react"

/**
 * The selection and hover layer.
 *
 * Drawn above the page, never inside it. Rendered independently of node content,
 * which docs/phases.md requires — and which is the only way it can work: the
 * outline has to sit outside the node's own box to show a 2px border without
 * changing the layout it is measuring.
 *
 * Everything here reads measured boxes in frame space and projects them through
 * the transform. That is what makes pan and zoom free: the measurements do not
 * change, only their projection does.
 */

/** Where resize grips sit, and which way each one grows. */
const HANDLES = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { id: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { id: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { id: "w", x: 0, y: 0.5, cursor: "ew-resize" },
] as const

export type HandleId = (typeof HANDLES)[number]["id"]

export interface OverlaysProps {
  transform: Transform
  rects: NodeRects
  selected: readonly string[]
  hovered: string | null
  /** What to call the hovered node, and how big it is. */
  labelFor: (id: string) => string
  guides: readonly Guide[]
  marquee: { x: number; y: number; width: number; height: number } | null
  onResizeStart?: ((handle: HandleId, event: React.PointerEvent) => void) | undefined
}

export function Overlays({
  transform,
  rects,
  selected,
  hovered,
  labelFor,
  guides,
  marquee,
  onResizeStart,
}: OverlaysProps): ReactElement {
  const primary = selected[0]
  const primaryRect = primary === undefined ? undefined : rects.get(primary)

  return (
    // Not interactive except where it says so: the page underneath has to
    // receive every click, hover and scroll that is not a resize grip.
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {guides.map((guide, index) => (
        <Line
          key={`${guide.axis}-${guide.position}-${index}`}
          guide={guide}
          transform={transform}
        />
      ))}

      {hovered !== undefined && hovered !== null && !selected.includes(hovered)
        ? (() => {
            const rect = rects.get(hovered)

            if (rect === undefined) return null

            const screen = rectToScreen(rect, transform)

            return (
              <>
                <div
                  className="absolute border border-primary/40"
                  style={{
                    left: screen.x,
                    top: screen.y,
                    width: screen.width,
                    height: screen.height,
                  }}
                />
                <Label
                  text={`${labelFor(hovered)} · ${Math.round(rect.width)}×${Math.round(rect.height)}`}
                  x={screen.x}
                  y={screen.y}
                />
              </>
            )
          })()
        : null}

      {selected.map((id) => {
        const rect = rects.get(id)

        if (rect === undefined) return null

        const screen = rectToScreen(rect, transform)

        return (
          <div
            key={id}
            className="absolute border-2 border-primary"
            style={{ left: screen.x, top: screen.y, width: screen.width, height: screen.height }}
          />
        )
      })}

      {/*
        Handles on the primary selection only. Eight grips around each of five
        selected nodes is forty targets in the same place, and none of them is
        the one the user wanted.
      */}
      {primary !== undefined && primaryRect !== undefined
        ? HANDLES.map((handle) => {
            const screen = rectToScreen(primaryRect, transform)

            return (
              <button
                key={handle.id}
                type="button"
                aria-label={`Resize ${handle.id}`}
                tabIndex={-1}
                onPointerDown={(event) => onResizeStart?.(handle.id, event)}
                className="pointer-events-auto absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-primary bg-surface"
                style={{
                  left: screen.x + screen.width * handle.x,
                  top: screen.y + screen.height * handle.y,
                  cursor: handle.cursor,
                }}
              />
            )
          })
        : null}

      {marquee === null ? null : (
        <div
          className="absolute border border-primary bg-primary/10"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      )}
    </div>
  )
}

function Line({ guide, transform }: { guide: Guide; transform: Transform }): ReactElement {
  const at = guide.axis === "x" ? guide.position * transform.zoom + transform.pan.x : 0
  const along = guide.axis === "x" ? 0 : guide.position * transform.zoom + transform.pan.y
  const from =
    guide.axis === "x"
      ? guide.span.from * transform.zoom + transform.pan.y
      : guide.span.from * transform.zoom + transform.pan.x
  const to =
    guide.axis === "x"
      ? guide.span.to * transform.zoom + transform.pan.y
      : guide.span.to * transform.zoom + transform.pan.x

  return guide.axis === "x" ? (
    <div
      className="absolute w-px bg-danger"
      style={{ left: at, top: from, height: Math.max(1, to - from) }}
    />
  ) : (
    <div
      className="absolute h-px bg-danger"
      style={{ top: along, left: from, width: Math.max(1, to - from) }}
    />
  )
}

/**
 * The hover label.
 *
 * Above the node, and below it when there is no room above — a label clipped by
 * the top of the viewport tells the user nothing.
 */
function Label({ text, x, y }: { text: string; x: number; y: number }): ReactElement {
  const above = y > 24

  return (
    <div
      className="absolute whitespace-nowrap rounded-sm bg-primary px-2 py-1 text-tiny text-primary-foreground"
      style={{ left: x, top: above ? y - 22 : y + 2 }}
    >
      {text}
    </div>
  )
}
