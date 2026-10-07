"use client"

import {
  indicatorFor,
  rectToScreen,
  type DropPosition,
  type Guide,
  type NodeRects,
  type Rect,
  type Transform,
} from "@checkout-studio/editor"
import type { ReactElement } from "react"

import { cn } from "@checkout-studio/ui"

import { SelectionToolbar } from "./SelectionToolbar"

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
  /**
   * Whether the selection may be resized.
   *
   * False for a locked node, which stays selectable and outlined but offers no
   * grips — docs/editor-behavior.md § Locked Components. Grips that refused the
   * drag would be a worse way to say the same thing.
   */
  resizable?: boolean
  /** How tall the surface is, so the toolbar can flip below the selection. */
  surfaceHeight?: number
  /** Where a drag would land, drawn so the drop is never a surprise. */
  drop?: { rect: Rect; position: DropPosition; refused: boolean } | null
}

export function Overlays({
  transform,
  rects,
  selected,
  hovered,
  labelFor,
  guides,
  marquee,
  resizable = true,
  surfaceHeight = 0,
  drop = null,
  onResizeStart,
}: OverlaysProps): ReactElement {
  const primary = selected[0]
  const primaryRect = primary === undefined ? undefined : rects.get(primary)
  const primaryScreen = primaryRect === undefined ? null : rectToScreen(primaryRect, transform)

  return (
    <>
      {/*
        Decoration, and hidden as decoration should be.
        
        Outlines, guides, labels and the marquee all describe the selection
        rather than being it — a screen reader that announced each of them would
        read a running commentary on a box it cannot see. `pointer-events-none`
        for the same reason in the other direction: the page underneath has to
        receive every click, hover and scroll that is not a grip.
      */}
      <div
        aria-hidden
        data-canvas-overlays
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
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
          Where it would land, or that it would not.

          Phase 8's first exit criterion is that the drop position is always
          shown before release; the second half of that is showing when there
          is no drop — a refused drag that looked identical to an accepted one
          would be the guessing this is here to remove.
        */}
        {drop === null ? null : <DropIndicator {...drop} transform={transform} />}

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

      {/*
        The grips, which are controls rather than decoration.
        
        Deliberately outside the layer above: `aria-hidden` on something
        interactive is an ARIA violation, and it was hiding eight labelled
        buttons from every assistive technology. They are not in the tab order —
        `tabIndex={-1}` — because the canvas is operated through its own
        keyboard model, and eight tab stops per selection would be noise. A
        keyboard resize is not specified yet, and these are pointer-only until
        it is.

        Handles on the primary selection only. Eight grips around each of five
        selected nodes is forty targets in the same place, and none of them is
        the one the user wanted.
      */}
      {primary !== undefined && primaryRect !== undefined && resizable ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {HANDLES.map((handle) => {
            const screen = primaryScreen ?? { x: 0, y: 0, width: 0, height: 0 }

            return (
              <button
                key={handle.id}
                type="button"
                aria-label={`Resize ${handle.id}`}
                tabIndex={-1}
                onPointerDown={(event) => onResizeStart?.(handle.id, event)}
                className="pointer-events-auto absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-tight border border-primary bg-surface"
                style={{
                  left: screen.x + screen.width * handle.x,
                  top: screen.y + screen.height * handle.y,
                  cursor: handle.cursor,
                }}
              />
            )
          })}
        </div>
      ) : null}

      {/*
        The inline selection toolbar, in the controls layer for the same reason
        the grips are: it holds buttons, and `aria-hidden` on something
        interactive hides it from every assistive technology.
      */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <SelectionToolbar rect={primaryScreen} surfaceHeight={surfaceHeight} />
      </div>
    </>
  )
}

/**
 * The insertion line, or the container that would receive the drop.
 *
 * Two shapes, because a drop means two different things. Between siblings there
 * is an edge to point at; inside a container there is not, and a line drawn
 * somewhere within it would be a claim about which part.
 *
 * Drawn in screen space, which is what `indicatorFor` returns: a 2px line
 * inside the scaled layer would be 0.2px at 10% zoom and 8px at 400% —
 * invisible exactly when the user is squinting at it.
 */
function DropIndicator({
  rect,
  position,
  refused,
  transform,
}: {
  rect: Rect
  position: DropPosition
  refused: boolean
  transform: Transform
}): ReactElement {
  const at = indicatorFor(rect, position, transform)

  if (at.shape === "outline") {
    return (
      <div
        className={cn(
          "absolute rounded-tight border-2",
          refused ? "border-danger bg-danger/5" : "border-primary bg-primary/5",
        )}
        style={{ left: at.x, top: at.y, width: at.width, height: at.height }}
      />
    )
  }

  return (
    <div
      // Centred on the edge rather than hanging below it, so the line marks the
      // gap rather than appearing to belong to the node under it.
      className={cn("absolute -translate-y-1/2", refused ? "bg-danger" : "bg-primary")}
      // design-system-ignore: an insertion line is a hairline, not a spacing step.
      style={{ left: at.x, top: at.y, width: at.width, height: 2 }}
    />
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
