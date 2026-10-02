"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent, ReactElement } from "react"
import {
  FRAME_LABEL,
  FRAME_WIDTH,
  GRID_SIZE,
  frameRect,
  labelFor,
  measureNodes,
  nodesIn,
  rectBetween,
  selectionFor,
  useContentHeight,
  useEditorStore,
  useEditorStoreApi,
  useNodeRects,
  useNodeResolver,
  usePanZoom,
  useViewport,
} from "@checkout-studio/editor"
import type { Rect } from "@checkout-studio/editor"
import { CheckoutRenderer } from "@checkout-studio/renderer"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { siblings } from "@checkout-studio/schema"

import { Breadcrumb } from "./Breadcrumb"
import { Overlays } from "./Overlays"
import { RULER_SIZE, Rulers } from "./Rulers"
import { useHeldKey } from "./useHeldKey"
import { registry } from "@/studio/registry"

/**
 * The canvas.
 *
 * The page is rendered by the renderer, in editor-preview mode — the same
 * pipeline a published checkout goes through. That is what makes the canvas
 * WYSIWYG rather than an approximation of it: there is no second renderer to
 * drift from the first.
 *
 * Three layers, bottom to top: the transformed frame holding the page, the
 * overlay layer reading measured boxes, and the rulers. Only the frame is
 * transformed, so panning and zooming are one CSS transform rather than a
 * re-render of anything inside it.
 *
 * See docs/editor-behavior.md § Canvas and docs/renderer.md § Runtime Modes.
 */

/** A drag of fewer pixels than this was a click that wobbled. */
const MARQUEE_MINIMUM = 4

/*
 * The 8px grid, drawn as two gradients.
 *
 * The rhythm is the gap between the lines — GRID_SIZE, from the editor — while
 * the lines themselves are one device pixel by definition.
 */
const GRID_LINES =
  // design-system-ignore: a grid line is a hairline, not a spacing step.
  "linear-gradient(to right, var(--cs-color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--cs-color-border) 1px, transparent 1px)"

export interface CanvasProps {
  /**
   * The resolved theme.
   *
   * Resolved on the server and passed in, not read from the document: the
   * document holds a *reference* to a theme, and resolving it means reading the
   * theme records — which the canvas has no business doing.
   */
  theme: CheckoutTheme
}

export function Canvas({ theme }: CanvasProps): ReactElement {
  const store = useEditorStoreApi()
  const surface = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)

  const document = useEditorStore((state) => state.document)
  const breakpoint = useEditorStore((state) => state.viewport.breakpoint)
  const selected = useEditorStore((state) => state.selection.ids)
  const showRulers = useEditorStore((state) => state.viewport.showRulers)
  const showGrid = useEditorStore((state) => state.viewport.showGrid)
  const canEdit = useEditorStore((state) => state.persistence.canEdit)

  const [hovered, setHovered] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)

  const panning = useHeldKey("Space")
  const viewport = useViewport()
  const resolve = useNodeResolver()
  const contentHeight = useContentHeight(frame)

  usePanZoom({ surface, panning })

  /*
   * Only the boxes the overlays need.
   *
   * The selection, what the pointer is over, and the selection's siblings —
   * which is what alignment guides line up against. Measuring two thousand
   * nodes to outline one is how a canvas drops frames, and most of them are not
   * even on screen.
   */
  const measured = useMemo(() => {
    const ids = new Set<string>(selected)

    if (hovered !== null) ids.add(hovered)
    for (const id of selected) for (const sibling of siblings(document, id)) ids.add(sibling)

    return [...ids]
  }, [selected, hovered, document])

  const rects = useNodeRects(frame, measured)
  const frameBox = frameRect(breakpoint, contentHeight)

  /** The pointer's position inside the surface, which every gesture works in. */
  const localPoint = useCallback((event: { clientX: number; clientY: number }): Rect => {
    const bounds = surface.current?.getBoundingClientRect()

    if (bounds === undefined) return { x: 0, y: 0, width: 0, height: 0 }

    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top, width: 0, height: 0 }
  }, [])

  const selectFromMarquee = useCallback(
    (box: Rect) => {
      const { zoom, pan } = store.getState().viewport
      const inFrame = {
        x: (box.x - pan.x) / zoom,
        y: (box.y - pan.y) / zoom,
        width: box.width / zoom,
        height: box.height / zoom,
      }

      // The one gesture that genuinely needs every box: a marquee can catch
      // anything, so there is no smaller set to measure.
      const all =
        frame.current === null
          ? new Map<string, Rect>()
          : measureNodes(frame.current, Object.keys(document.nodes), zoom)

      store.getState().select(nodesIn(document, all, inFrame))
    },
    [store, document],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (panning || event.button !== 0) return

      const hit = resolve(event.target as Element)

      if (hit !== null) {
        // Read-only still selects: the inspector showing what is there is
        // useful, and nothing about it changes the page.
        store
          .getState()
          .select(canEdit ? selectionFor(document, hit, store.getState().selection.ids) : [hit])
        return
      }

      const origin = localPoint(event)

      setMarquee(origin)

      const move = (next: PointerEvent): void => {
        setMarquee(rectBetween(origin, localPoint(next)))
      }

      const up = (next: PointerEvent): void => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        setMarquee(null)

        const box = rectBetween(origin, localPoint(next))

        if (box.width < MARQUEE_MINIMUM && box.height < MARQUEE_MINIMUM) {
          store.getState().clearSelection()
          return
        }

        selectFromMarquee(box)
      }

      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
    },
    [panning, resolve, store, document, canEdit, localPoint, selectFromMarquee],
  )

  const nameOf = useCallback(
    (id: string) => {
      const node = document.nodes[id]

      return node === undefined ? id : labelFor(node)
    },
    [document],
  )

  return (
    <main
      id="shell-canvas"
      tabIndex={-1}
      aria-label="Canvas"
      className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
    >
      <div
        ref={surface}
        className="absolute inset-0"
        style={{
          cursor: panning ? "grab" : "default",
          paddingTop: showRulers ? RULER_SIZE : 0,
          paddingLeft: showRulers ? RULER_SIZE : 0,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          if (marquee !== null || panning) return

          setHovered(resolve(event.target as Element))
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${viewport.transform.pan.x}px, ${viewport.transform.pan.y}px) scale(${viewport.transform.zoom})`,
            width: FRAME_WIDTH[breakpoint],
          }}
        >
          <div
            aria-hidden
            className="absolute -top-6 left-0 whitespace-nowrap text-caption text-foreground-muted"
            // Counter-scaled, so the device label stays the same size at any
            // zoom. One that shrank to nothing at 10% is a label nobody reads.
            style={{
              transform: `scale(${1 / viewport.transform.zoom})`,
              transformOrigin: "left bottom",
            }}
          >
            {FRAME_LABEL[breakpoint]} · {FRAME_WIDTH[breakpoint]}
          </div>

          <div
            ref={frame}
            data-canvas-frame
            className="min-h-px bg-surface shadow-card"
            style={
              showGrid
                ? {
                    backgroundImage: GRID_LINES,
                    backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                  }
                : undefined
            }
          >
            <CheckoutRenderer
              schema={document}
              theme={theme}
              registry={registry}
              mode="editor-preview"
              breakpoint={breakpoint}
            />
          </div>
        </div>

        <Overlays
          transform={viewport.transform}
          rects={rects}
          selected={selected}
          hovered={hovered}
          labelFor={nameOf}
          guides={[]}
          marquee={marquee}
        />
      </div>

      {showRulers ? (
        <Rulers
          transform={viewport.transform}
          width={surface.current?.clientWidth ?? 0}
          height={surface.current?.clientHeight ?? 0}
        />
      ) : null}

      {/*
        Outside the gesture surface, so clicking a breadcrumb does not also
        reach the canvas-background handler and clear what it just selected.
      */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 px-2 pb-2">
        <div className="pointer-events-auto min-w-0 flex-1">
          <Breadcrumb />
        </div>
        <span
          aria-hidden
          className="rounded-full bg-surface/90 px-2 py-1 text-tiny text-foreground-muted"
        >
          {frameBox.width} × {Math.round(frameBox.height)}
        </span>
      </div>
    </main>
  )
}
