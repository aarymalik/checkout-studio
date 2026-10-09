"use client"

import { useEffect, useMemo, useRef } from "react"
import type { ReactElement } from "react"
import { rectToScreen, useEditorStore, type Point, type Rect } from "@checkout-studio/editor"
import { CheckoutRenderer } from "@checkout-studio/renderer"
import { extract, type CheckoutSchema, type CheckoutTheme } from "@checkout-studio/schema"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"

/**
 * The thing that follows the cursor while a node is being dragged.
 *
 * The component itself, not a grey rectangle standing in for it —
 * docs/editor-behavior.md § Drag Preview asks for the dragged component at 80%
 * opacity with a shadow and a 1.02 scale, and the renderer can draw a subtree
 * as readily as a page. What the user is moving is the thing they can see.
 *
 * ## Two things it must not break
 *
 * The renderer puts `classFor(node.id)` on every element, so a preview of the
 * same subtree carries the same classes as the real nodes. Measurement would
 * then have two elements to choose from for one id. It does not, because every
 * query that looks for a node is scoped to `[data-canvas-frame]` —
 * `elementFor` included — and this renders outside it. `pointer-events: none`
 * keeps it out of hit testing for the same reason: the node under the cursor
 * has to be the page, not the thing being carried over it.
 *
 * And it moves by writing a transform to a ref rather than by rendering.
 * docs/performance.md requires transform-only movement during a drag, and a
 * preview re-rendered per frame would re-render a subtree per frame — the same
 * mistake the canvas made with its own page before Phase 7 measured it.
 */

export interface DragPreviewProps {
  theme: CheckoutTheme
  registry: RendererRegistry
  /** Measured boxes in canvas space, for sizing the preview as it appears. */
  rects: ReadonlyMap<string, Rect>
  /** Where the pointer was when the drag began. Null when nothing is dragging. */
  origin: Point | null
}

/** Opacity, shadow and scale from docs/editor-behavior.md § Drag Preview. */
const SCALE = 1.02

export function DragPreview({
  theme,
  registry,
  rects,
  origin,
}: DragPreviewProps): ReactElement | null {
  const document = useEditorStore((state) => state.document)
  const dragged = useEditorStore((state) => state.drag.ids)
  /*
   * Selected one field at a time, deliberately.
   *
   * Returning `{ zoom, pan }` from the selector builds a new object on every
   * call, so the store sees a changed value on every notification and
   * re-renders for ever — React stops it with "Maximum update depth exceeded",
   * which is how this was found. The stored values are already stable.
   */
  const zoom = useEditorStore((state) => state.viewport.zoom)
  const pan = useEditorStore((state) => state.viewport.pan)
  const transform = useMemo(() => ({ zoom, pan }), [zoom, pan])
  const element = useRef<HTMLDivElement>(null)

  const id = dragged[0]

  /**
   * The dragged subtree as a document of its own.
   *
   * One node of the five hundred a page might hold, so this is cheap — and it
   * is memoised anyway, because it must not be rebuilt while the pointer
   * moves.
   */
  const preview = useMemo<CheckoutSchema | null>(() => {
    if (id === undefined) return null

    const fragment = extract(document, id)

    if (fragment === null) return null

    return { ...document, root: fragment.rootId, nodes: fragment.nodes }
  }, [document, id])

  const box = id === undefined ? undefined : rects.get(id)
  const screen = box === undefined ? null : rectToScreen(box, transform)

  /*
   * Where in the node the drag began.
   *
   * Carried so the node stays under the hand. Without it the preview jumps on
   * the first frame so that its top-left corner meets the cursor, which reads
   * as the component leaping out from under the pointer.
   */
  const grab = useMemo(() => {
    if (origin === null || screen === null) return { x: 0, y: 0 }

    return { x: origin.x - screen.x, y: origin.y - screen.y }
  }, [origin, screen])

  useEffect(() => {
    const node = element.current

    if (node === null) return

    const follow = (event: PointerEvent): void => {
      // A transform, and nothing else. Writing `left`/`top` would lay the
      // page out again on every frame of the drag.
      node.style.transform = `translate3d(${event.clientX - grab.x}px, ${event.clientY - grab.y}px, 0) scale(${SCALE})`
    }

    window.addEventListener("pointermove", follow)

    return () => {
      window.removeEventListener("pointermove", follow)
    }
  }, [grab])

  /*
   * The rendered subtree, held still while the preview moves.
   *
   * This component re-renders on every frame of a drag, because its parent
   * does: the gesture's resolved drop is React state. Nothing the renderer is
   * given changes while the pointer moves, so re-rendering a subtree per frame
   * would be work for no difference — movement is a transform written to a
   * ref.
   *
   * Measured honestly: memoising this was worth far less than it looked when
   * the drag was first profiled. What the benchmark was reporting then was the
   * cost of mounting this subtree once, read out of too short a recording. See
   * docs/performance.md § Starting a gesture is not sustaining one.
   */
  const drawn = useMemo(
    () =>
      preview === null ? null : (
        <div className="origin-top-left" style={{ transform: `scale(${zoom})` }}>
          <div style={{ width: box?.width }}>
            <CheckoutRenderer
              schema={preview}
              theme={theme}
              registry={registry}
              mode="editor-preview"
            />
          </div>
        </div>
      ),
    [preview, theme, registry, zoom, box?.width],
  )

  if (drawn === null || screen === null) return null

  return (
    <div
      ref={element}
      aria-hidden
      // A handle for the end-to-end tests, which are the only place a real
      // drag happens: jsdom has no layout, so every rect there is a stub.
      data-drag-preview
      /*
       * Fixed, so it is positioned against the viewport rather than against a
       * canvas that is itself panning underneath — and above everything,
       * because it is the thing in the user's hand.
       */
      className="pointer-events-none fixed left-0 top-0 z-50 origin-top-left opacity-80 shadow-popover"
      style={{
        /*
         * Promoted, because this element's transform is written on every frame
         * of a drag and nothing else about it changes. A sustained drag
         * measures at no added work per frame; this is part of keeping it
         * there rather than a fix for something that was wrong.
         */
        willChange: "transform",
        width: screen.width,
        // Hidden until the first move positions it, so it does not appear in
        // the corner for one frame.
        transform: `translate3d(${(origin?.x ?? 0) - grab.x}px, ${(origin?.y ?? 0) - grab.y}px, 0) scale(${SCALE})`,
      }}
    >
      {/* Drawn at the canvas's zoom, so what is carried is the size of what
          was picked up. */}
      {drawn}
    </div>
  )
}
