"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

import { useEditorStore, useEditorStoreApi } from "../state/context"
import type { NodeRects } from "../canvas/hit"
import type { Point } from "../canvas/transform"
import { resolveDrop, type Drop } from "./resolve"
import { dropRejection, type DropRules, type Rejection } from "./validity"

/**
 * Dragging a node on the canvas.
 *
 * Raw pointer events rather than dnd-kit, and the reason is the architecture
 * rather than taste. dnd-kit's draggable model needs refs and listeners
 * attached to each draggable element, and the canvas does not own that DOM —
 * the renderer does, because the same renderer draws the published page, and
 * docs/architecture.md holds that it must never depend on builder code. The
 * canvas already resolves a pointer to a node by hit testing, which is the
 * shape `usePanZoom` and `useResize` established. dnd-kit does the layers panel
 * and the component library, where the editor owns the rows.
 *
 * What this produces is a resolved drop in the store on every move, so the
 * overlay can draw it, and a single `move` per node inside one transaction on
 * release — Phase 8's exit criteria are that the drop position is always shown
 * before release and that one drag equals one undo step.
 *
 * See docs/editor-behavior.md § Drag & Drop and docs/phases.md Phase 8.
 */

/** Below this the pointer wobbled while clicking, and nothing is dragged. */
const THRESHOLD = 4

export interface DragControls {
  /** Whether a drag is in progress. */
  dragging: boolean
  /**
   * Where the pointer was when the drag was picked up, in client coordinates.
   *
   * Set once per gesture rather than tracked, so reading it costs nothing per
   * frame. The preview needs it to stay under the hand: without it the node
   * jumps so its corner meets the cursor the moment the drag starts.
   */
  origin: Point | null
  /** Where it would land, or null when nowhere would take it. */
  drop: Drop | null
  /** Why it would be refused, or null when it would be accepted. */
  rejection: Rejection | null
  /** Call from a pointer-down on the canvas to arm a drag of the selection. */
  begin: (event: ReactPointerEvent) => void
}

export interface UseDragOptions extends DropRules {
  /** Measured boxes, in canvas space. */
  rects: NodeRects
  /** The pointer's position in canvas space, which only the canvas can work out. */
  toCanvas: (event: { clientX: number; clientY: number }) => Point
}

export function useDrag({ rects, toCanvas, ...rules }: UseDragOptions): DragControls {
  const store = useEditorStoreApi()
  const dragging = useEditorStore((state) => state.drag.ids.length > 0)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [rejection, setRejection] = useState<Rejection | null>(null)
  const [origin, setOrigin] = useState<Point | null>(null)

  /** Armed but not yet dragging: the pointer is down and has not moved far. */
  const armed = useRef<{ ids: readonly string[]; from: Point } | null>(null)

  /*
   * Read through refs, because the listeners below are attached once per
   * gesture and must see the current values rather than the ones that existed
   * when the pointer went down. The same mistake auto-scroll made in Phase 7:
   * depending on them directly tore the listeners down mid-drag.
   */
  const latest = useRef({ rects, toCanvas, rules })

  latest.current = { rects, toCanvas, rules }

  const begin = useCallback(
    (event: ReactPointerEvent) => {
      const state = store.getState()

      // Nothing selected, a session that may only read, or a document that
      // cannot be read: there is nothing to pick up.
      if (!state.persistence.canEdit || state.selection.ids.length === 0) return
      if (event.button !== 0) return

      armed.current = {
        ids: state.selection.ids,
        from: { x: event.clientX, y: event.clientY },
      }
    },
    [store],
  )

  /** Stop, and leave the tree exactly as it was. */
  const cancel = useCallback(() => {
    armed.current = null
    setDrop(null)
    setRejection(null)
    setOrigin(null)
    store.getState().endDrag()
  }, [store])

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const start = armed.current

      if (start === null) return

      const { rects: boxes, toCanvas: project, rules: current } = latest.current
      const travelled =
        Math.abs(event.clientX - start.from.x) + Math.abs(event.clientY - start.from.y)

      if (!dragging) {
        // A click that wobbled is a click. Selection already happened on the
        // pointer down, so arming and never starting costs nothing.
        if (travelled < THRESHOLD) return

        store.getState().beginDrag(start.ids)
        setOrigin(start.from)
      }

      const document = store.getState().document
      const resolved = resolveDrop(document, boxes, project(event), {
        ...current,
        dragging: start.ids,
      })

      setDrop(resolved)

      if (resolved === null) {
        setRejection(null)
        store.getState().setDropTarget(null, null)
        return
      }

      /*
       * Asked on every move, not on release.
       *
       * "Every rejection explains itself" is only useful while the pointer is
       * still down — a drag that looks fine and then refuses has taught the
       * user nothing, and they will try it again the same way.
       */
      const refusal = dropRejection(document, start.ids, resolved.parentId, current)

      setRejection(refusal)
      store.getState().setDropTarget(resolved.overId, refusal === null ? resolved.position : null)
    }

    const up = (): void => {
      const start = armed.current

      armed.current = null

      if (start === null) return

      const state = store.getState()

      if (state.drag.ids.length === 0) {
        // Never passed the threshold: a click, already handled by selection.
        cancel()
        return
      }

      const landing = drop
      const refused = rejection !== null

      cancel()

      if (landing === null || refused) return

      /*
       * One transaction, so one undo step.
       *
       * A multiple selection is several `move` calls and the user did one
       * thing. Dragged in order, so three nodes dropped together arrive in the
       * order they were in rather than reversed.
       */
      store.getState().transact("Move", () => {
        let index = landing.index

        for (const id of start.ids) {
          store.getState().move(id, landing.parentId, index)

          /*
           * Advanced for each one, not only for the ones that landed.
           *
           * The index is about the order they arrive in: dropping three nodes
           * at one position means first, second, third, not all three at the
           * same one. Whether each `move` succeeded is not a question worth
           * asking here — `dropRejection` answered it for every id before the
           * pointer came up, and branching on an answer that cannot be no is a
           * branch no test can reach.
           */
          index += 1
        }
      })
    }

    const key = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || armed.current === null) return

      // Cancelled, and the tree is untouched because nothing has been written
      // yet: the move happens on release and only on release.
      event.preventDefault()
      cancel()
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("keydown", key)

    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("keydown", key)
    }
  }, [store, dragging, drop, rejection, cancel])

  return { dragging, origin, drop, rejection, begin }
}
