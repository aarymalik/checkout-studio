"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"

import { useEditorStore, useEditorStoreApi } from "../state/context"
import { autoScrollVelocity, stepFor } from "./autoscroll"
import type { AutoScrollOptions } from "./autoscroll"
import { frameRect } from "./frames"
import { classIndex, measureContentHeight, measureNodes, nodeIdAt } from "./measure"
import type { NodeRects } from "./hit"
import type { Point, Rect, Size, Transform } from "./transform"
import {
  isZoomGesture,
  panBy,
  resetViewport,
  stepZoom,
  zoomAt,
  zoomFactorFor,
  zoomToFit,
  zoomToRect,
} from "./viewport"
import { boundsOf } from "./transform"

/**
 * Binding the canvas geometry to the store and the DOM.
 *
 * The arithmetic lives in the other modules and is tested without a browser.
 * These hooks are the thin layer that reads a pointer, writes a transform, and
 * measures what the renderer drew — the parts that genuinely need React and a
 * DOM, kept small enough to see.
 */

/** The viewport transform, and the operations that move it. */
export interface ViewportControls {
  transform: Transform
  panBy(delta: Point): void
  zoomAt(zoom: number, focus: Point): void
  step(direction: 1 | -1, focus?: Point): void
  fit(content: Rect, viewport: Size): void
  toSelection(rects: NodeRects, viewport: Size): void
  reset(content: Rect, viewport: Size): void
}

export function useViewport(): ViewportControls {
  const store = useEditorStoreApi()
  const zoom = useEditorStore((state) => state.viewport.zoom)
  const pan = useEditorStore((state) => state.viewport.pan)
  const transform = useMemo<Transform>(() => ({ zoom, pan }), [zoom, pan])

  const write = useCallback(
    (next: Transform) => {
      // One write per gesture step, both fields together. Setting the zoom and
      // then the pan would render once at the new scale with the old offset,
      // which is a visible jump at every wheel notch.
      store.setState((state) => ({
        ...state,
        viewport: { ...state.viewport, zoom: next.zoom, pan: next.pan },
      }))
    },
    [store],
  )

  const current = useCallback((): Transform => {
    const state = store.getState().viewport

    return { zoom: state.zoom, pan: state.pan }
  }, [store])

  return useMemo(
    () => ({
      transform,
      panBy: (delta) => write(panBy(current(), delta)),
      zoomAt: (next, focus) => write(zoomAt(current(), next, focus)),
      step: (direction, focus = { x: 0, y: 0 }) => write(stepZoom(current(), direction, focus)),
      fit: (content, viewport) => write(zoomToFit(content, viewport)),
      toSelection: (rects, viewport) => {
        const selected = store.getState().selection.ids
        const bounds = boundsOf(
          selected.map((id) => rects.get(id)).filter((rect): rect is Rect => rect !== undefined),
        )

        // Nothing selected, or nothing measured: fitting the page is the
        // nearest useful thing to what was asked for.
        write(
          bounds === null
            ? zoomToFit(frameRect(store.getState().viewport.breakpoint, viewport.height), viewport)
            : zoomToRect(bounds, viewport),
        )
      },
      reset: (content, viewport) => write(resetViewport(content, viewport)),
    }),
    [transform, write, current, store],
  )
}

export interface PanZoomOptions {
  /** The element gestures are read from. */
  surface: RefObject<HTMLElement | null>
  /** Whether the space bar is held, which turns a drag into a pan. */
  panning?: boolean
}

/**
 * Wheel, pinch and drag on the canvas surface.
 *
 * Attached with a non-passive listener, because a pinch has to be prevented
 * from zooming the whole page and `preventDefault` on a passive listener does
 * nothing. React's `onWheel` is passive, so this is an effect rather than a
 * prop.
 */
export function usePanZoom({ surface, panning = false }: PanZoomOptions): void {
  const viewport = useViewport()
  const held = useRef(panning)

  held.current = panning

  useEffect(() => {
    const element = surface.current

    if (element === null) return

    const localPoint = (event: { clientX: number; clientY: number }): Point => {
      const bounds = element.getBoundingClientRect()

      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    }

    const onWheel = (event: WheelEvent): void => {
      if (isZoomGesture(event)) {
        event.preventDefault()
        const factor = zoomFactorFor(event.deltaY)
        const focus = localPoint(event)

        viewport.zoomAt(factor * (viewport.transform.zoom || 1), focus)
        return
      }

      // A plain wheel pans. The canvas is the scrolling surface, so the page
      // behind it must not move as well.
      event.preventDefault()
      viewport.panBy({ x: -event.deltaX, y: -event.deltaY })
    }

    let dragging = false

    const onPointerDown = (event: PointerEvent): void => {
      // Middle button, or space held, per docs/editor-behavior.md § Canvas Pan.
      if (event.button !== 1 && !held.current) return

      dragging = true
      element.setPointerCapture(event.pointerId)
      event.preventDefault()
    }

    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging) return

      viewport.panBy({ x: event.movementX, y: event.movementY })
    }

    const onPointerUp = (event: PointerEvent): void => {
      if (!dragging) return

      dragging = false
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    }

    element.addEventListener("wheel", onWheel, { passive: false })
    element.addEventListener("pointerdown", onPointerDown)
    element.addEventListener("pointermove", onPointerMove)
    element.addEventListener("pointerup", onPointerUp)
    element.addEventListener("pointercancel", onPointerUp)

    return () => {
      element.removeEventListener("wheel", onWheel)
      element.removeEventListener("pointerdown", onPointerDown)
      element.removeEventListener("pointermove", onPointerMove)
      element.removeEventListener("pointerup", onPointerUp)
      element.removeEventListener("pointercancel", onPointerUp)
    }
  }, [surface, viewport])
}

/**
 * The boxes of the nodes the caller asked about.
 *
 * Only those: measuring two thousand nodes to outline one is how a canvas drops
 * frames. Re-measured when the document changes, when the zoom changes, and
 * when the frame resizes — which covers a component reflowing without the
 * document moving.
 */
export function useNodeRects(frame: RefObject<Element | null>, ids: readonly string[]): NodeRects {
  const document = useEditorStore((state) => state.document)
  const zoom = useEditorStore((state) => state.viewport.zoom)
  const [rects, setRects] = useState<NodeRects>(() => new Map())
  const key = ids.join(" ")

  useEffect(() => {
    const element = frame.current

    if (element === null) return

    const measure = (): void => {
      setRects(measureNodes(element, key === "" ? [] : key.split(" "), zoom))
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [frame, key, zoom, document])

  return rects
}

/** How tall the rendered page is, which fitting and the frame's own box need. */
export function useContentHeight(frame: RefObject<Element | null>): number {
  const document = useEditorStore((state) => state.document)
  const zoom = useEditorStore((state) => state.viewport.zoom)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const element = frame.current

    if (element === null) return

    const measure = (): void => {
      setHeight(measureContentHeight(element, zoom))
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [frame, zoom, document])

  return height
}

/** Resolves a click to the node that was clicked, by walking the DOM outward. */
export function useNodeResolver(): (target: Element | null) => string | null {
  const document = useEditorStore((state) => state.document)
  const index = useMemo(() => classIndex(document), [document])

  return useCallback((target) => nodeIdAt(target, index), [index])
}

export interface AutoScrollControls {
  /** Call with the pointer's position in the surface, or null to stop. */
  track(point: Point | null): void
}

/**
 * Pans the canvas while the pointer sits near an edge.
 *
 * A frame loop rather than a timer, and a velocity rather than a step, so the
 * speed is the same on a 60 Hz and a 120 Hz display. Stops as soon as the
 * pointer leaves the edge zone, which is what keeps it from fighting the user.
 */
export function useAutoScroll(
  surface: RefObject<HTMLElement | null>,
  options: AutoScrollOptions = {},
): AutoScrollControls {
  const viewport = useViewport()
  const pointer = useRef<Point | null>(null)
  const frame = useRef<number | null>(null)
  const last = useRef(0)

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  const run = useCallback(
    (now: number) => {
      const element = surface.current
      const at = pointer.current

      if (element === null || at === null) {
        stop()
        return
      }

      const bounds = element.getBoundingClientRect()
      const velocity = autoScrollVelocity(
        at,
        { x: 0, y: 0, width: bounds.width, height: bounds.height },
        options,
      )

      if (velocity.x === 0 && velocity.y === 0) {
        stop()
        return
      }

      // First frame has no elapsed time to measure, so it moves nothing and
      // sets the clock. Treating it as a full frame makes the first step jump.
      const elapsed = last.current === 0 ? 0 : now - last.current
      last.current = now

      if (elapsed > 0) viewport.panBy(stepFor(velocity, elapsed))

      frame.current = requestAnimationFrame(run)
    },
    [surface, options, viewport, stop],
  )

  useEffect(() => stop, [stop])

  return useMemo(
    () => ({
      track: (point) => {
        pointer.current = point

        if (point === null) {
          stop()
          last.current = 0
          return
        }

        if (frame.current === null) {
          last.current = 0
          frame.current = requestAnimationFrame(run)
        }
      },
    }),
    [run, stop],
  )
}
