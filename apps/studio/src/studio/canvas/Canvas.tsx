"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  isLocked,
  useContentHeight,
  useEditorStore,
  useEditorStoreApi,
  useNodeRects,
  useNodeResolver,
  usePanZoom,
  boundsOf,
  useAutoScroll,
  useDrag,
  useInsertDrag,
  indicatorTarget,
  useResize,
  useScope,
  useViewport,
} from "@checkout-studio/editor"
import type { Rect, Rejection } from "@checkout-studio/editor"
import { CheckoutRenderer } from "@checkout-studio/renderer"
import type { CheckoutTheme, Node } from "@checkout-studio/schema"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"
import { siblings } from "@checkout-studio/schema"

import { Breadcrumb } from "./Breadcrumb"
import { CarryHint } from "./CarryHint"
import { DragPreview } from "./DragPreview"
import { Overlays } from "./Overlays"
import { SelectionAnnouncer } from "./SelectionAnnouncer"
import { RULER_SIZE, Rulers } from "./Rulers"
import { useHeldKey } from "./useHeldKey"
import { registry as shippedRegistry } from "@/studio/registry"

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
  /**
   * What knows how to draw each node.
   *
   * The build's own registry by default. Overridden only by the canvas
   * benchmark, which has to draw real components to measure anything useful and
   * cannot wait for the component library to ship them — see
   * docs/phases.md Phase 7 § Performance, which asks for exactly that.
   *
   * Still built once and passed down rather than created per render: the
   * renderer memoises component resolution on it, and a new object each render
   * would give that cache a different key to miss against every time.
   */
  registry?: RendererRegistry
}

export function Canvas({ theme, registry = shippedRegistry }: CanvasProps): ReactElement {
  const store = useEditorStoreApi()

  /*
   * The canvas is a keyboard scope while it is mounted.
   *
   * It is what makes a bare Shift and a letter legitimate for the breakpoints:
   * WCAG 2.1.4 allows a character key shortcut that is active only while
   * something has focus, and the keymap holds itself to one unmodified
   * character key outside this scope.
   */
  useScope("canvas")
  const surface = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)

  const document = useEditorStore((state) => state.document)
  const breakpoint = useEditorStore((state) => state.viewport.breakpoint)
  const selected = useEditorStore((state) => state.selection.ids)
  const showRulers = useEditorStore((state) => state.viewport.showRulers)
  const showGrid = useEditorStore((state) => state.viewport.showGrid)
  const canEdit = useEditorStore((state) => state.persistence.canEdit)

  /*
   * And the canvas with something selected, which is a narrower scope.
   *
   * It is what lets ⌘L be bound at all: the browser's "focus address bar" is
   * taken only inside the canvas with a selection, per docs/keyboard-shortcuts.md
   * § Structure. The scope was defined, ranked in scopes.ts, labelled in the
   * shortcut reference and listed in the preferences route — and nothing ever
   * activated it, so a binding there could never have fired.
   */
  useScope("canvas.selection", selected.length > 0)

  /*
   * And the canvas with something in the hand, which is modal.
   *
   * Deeper than `canvas.selection`, so while a node is being carried ↵ drops it
   * rather than stepping into it and Escape puts it back rather than clearing
   * the selection. Neither binding knows about the other; the scope decides.
   */
  const keyboardDrag = useEditorStore((state) => state.drag.keyboard)

  useScope("canvas.dragging", keyboardDrag !== null)

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
  /*
   * Memoised, because its identity is a dependency.
   *
   * `frameRect` is pure and recomputing it is free, so this looks like
   * premature optimisation and is not. The effect below publishes the canvas's
   * shape "on every change", and a fresh object every render made that every
   * *render* instead — which during a pan is sixty times a second, each one
   * forcing a layout to read the surface and writing to the store. The effect
   * says what it means now.
   */
  const frameBox = useMemo(() => frameRect(breakpoint, contentHeight), [breakpoint, contentHeight])

  /*
   * Resizing, and the guides it produces.
   *
   * The siblings are what the dragged edge lines up against, which is also why
   * they are measured above: alignment guides had no producer until now, so
   * `guides` was an empty array the overlay drew nothing from.
   */
  const resize = useResize({
    rects,
    siblingsOf: useCallback((id: string) => siblings(document, id), [document]),
  })

  /*
   * Telling the store what this canvas looks like.
   *
   * Zoom-to-fit needs the size of the visible area and of the page; zoom-to-
   * selection needs where the selection is. All three are known only here, and
   * all three are needed by commands — which are built once for the application
   * and have no DOM to ask.
   *
   * On every change rather than once: the surface resizes with the window and
   * the panels, the frame changes with the breakpoint and the content, and the
   * selection changes constantly. A stale measurement fits to where something
   * used to be.
   */
  useEffect(() => {
    const element = surface.current

    if (element === null) return

    const publish = (): void => {
      store.getState().setMeasured({
        surface: { width: element.clientWidth, height: element.clientHeight },
        frame: frameBox,
        selection: boundsOf(
          selected.map((id) => rects.get(id)).filter((rect): rect is Rect => rect !== undefined),
        ),
      })
    }

    publish()

    const observer = new ResizeObserver(publish)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [store, frameBox, rects, selected])

  /*
   * The page, held still while the viewport moves.
   *
   * This component re-renders on every frame of a pan or a zoom — it has to,
   * because it owns the transform — and the renderer is a plain function
   * component, so without this the whole document re-rendered with it. At two
   * thousand nodes the canvas benchmark measured 31ms a frame while zooming
   * against a 16.67ms budget, and 24ms for a selection change against 16.
   *
   * None of the renderer's inputs change when the viewport moves, so none of
   * that work was ever needed.
   */
  const page = useMemo(
    () => (
      <CheckoutRenderer
        schema={document}
        theme={theme}
        registry={registry}
        mode="editor-preview"
        breakpoint={breakpoint}
      />
    ),
    [document, theme, registry, breakpoint],
  )

  const primary = selected[0]
  /*
   * `isLocked` rather than the node's own flag.
   *
   * It was reading `metadata.locked` directly, which meant locking a container
   * left every one of its children resizable — and resizing a child moves the
   * contents of the thing that was locked. `isLocked` is self-or-ancestor,
   * which is what docs/editor-behavior.md § Lock describes.
   */
  const resizable = primary !== undefined && canEdit && !isLocked(document, primary)

  /**
   * Where the surface is, remembered rather than asked.
   *
   * `getBoundingClientRect` forces a synchronous layout, and this was called on
   * every pointer move of every gesture — a layout dirtied by the drag and then
   * read straight back. Removing it took the pan's added work from 0.3ms to
   * 0.0ms, which is the honest size of it: a real improvement, and not the
   * cause of the dropped frames I was chasing when I found it.
   *
   * The surface only moves when the window or the panels do, and the observer
   * below already hears about both. Scrolling is listened for separately
   * because a page that scrolls moves the surface without resizing it.
   */
  const bounds = useRef<{ left: number; top: number }>({ left: 0, top: 0 })

  useEffect(() => {
    const element = surface.current

    if (element === null) return

    const read = (): void => {
      const box = element.getBoundingClientRect()

      bounds.current = { left: box.left, top: box.top }
    }

    read()

    const observer = new ResizeObserver(read)
    observer.observe(element)
    window.addEventListener("scroll", read, { passive: true, capture: true })
    window.addEventListener("resize", read, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", read, true)
      window.removeEventListener("resize", read)
    }
  }, [])

  /** The pointer's position inside the surface, which every gesture works in. */
  const localPoint = useCallback((event: { clientX: number; clientY: number }): Rect => {
    const { left, top } = bounds.current

    return { x: event.clientX - left, y: event.clientY - top, width: 0, height: 0 }
  }, [])

  /**
   * The pointer in canvas space.
   *
   * `localPoint` gives the surface; the drop resolution works in the frame's
   * own units, which is where the measured boxes are. Two conversions, because
   * the frame is both panned and scaled inside the surface.
   */
  const canvasPoint = useCallback(
    (event: { clientX: number; clientY: number }): Rect => {
      const at = localPoint(event)
      const { zoom, pan } = store.getState().viewport

      return { x: (at.x - pan.x) / zoom, y: (at.y - pan.y) / zoom, width: 0, height: 0 }
    },
    [localPoint, store],
  )

  /**
   * The two rules the drag engine has no opinion about.
   *
   * Which components take children belongs to the registry, and what to call
   * one belongs to the layers panel's naming — `labelFor`, so a refusal, a
   * hover label and a layers row cannot call the same node three things.
   *
   * Both drags get both. `useDrag` was built with neither, which meant a node
   * moved on the canvas could be dropped into a component that holds nothing,
   * and that the sentence explaining a refusal had no name to use.
   */
  const rules = useMemo(
    () => ({
      canHaveChildren: (node: Node) => registry.get(node.type)?.container ?? true,
      nameOf: labelFor,
    }),
    [registry],
  )

  const drag = useDrag({ rects, toCanvas: canvasPoint, ...rules })
  /*
   * The library's drag, resolved here for the same reason the canvas resolves
   * its own: this is the only thing that knows where anything is. What it needs
   * from the library is the type, which travels through the store.
   */
  const inserting = useInsertDrag({ rects, toCanvas: canvasPoint, ...rules })

  /**
   * Where to draw "here", from whichever drag is in progress.
   *
   * One indicator, two gestures. A pointer drag resolves a node and a side; a
   * keyboard drag knows a parent and an index and `indicatorTarget` turns that
   * into the same pair — so the overlay draws one thing and does not need to
   * know which hand it came from.
   */
  const dropIndicator = useMemo(() => {
    // A drag out of the library outranks the others: it is the one the user
    // started most recently, and only one gesture can be in progress.
    if (inserting.type !== null) {
      if (inserting.drop === null) return null

      return {
        rect: rects.get(inserting.drop.overId) ?? frameBox,
        position: inserting.drop.position,
        refused: inserting.rejection !== null,
      }
    }

    const keyboard = keyboardDrag === null ? null : indicatorTarget(keyboardDrag)

    if (keyboard !== null) {
      const rect = rects.get(keyboard.overId)

      return rect === undefined ? null : { rect, position: keyboard.position, refused: false }
    }

    if (drag.drop === null) return null

    return {
      rect: rects.get(drag.drop.overId) ?? frameBox,
      position: drag.drop.position,
      refused: drag.rejection !== null,
    }
  }, [
    inserting.type,
    inserting.drop,
    inserting.rejection,
    keyboardDrag,
    drag.drop,
    drag.rejection,
    rects,
    frameBox,
  ])

  /**
   * Why the drop was refused, and which box to say it next to.
   *
   * Phase 8's third exit criterion. The reasons have always been written — the
   * drag layer builds a sentence per rule and names the node it is about — and
   * until now nothing read one, so the whole of "that is locked" reached the
   * user as the indicator turning red.
   *
   * The two gestures anchor it differently, and have to. A pointer is on the
   * refused spot, so the sentence belongs there, on the red indicator. A
   * refused keyboard step leaves the position alone, so the sentence belongs
   * on the node in hand: the indicator is still showing somewhere the node may
   * legitimately go, and labelling that red would be a lie about it.
   */
  const dropRefusal = useMemo(() => {
    const at = (id: string | undefined, rejection: Rejection | null) => {
      if (rejection === null) return null

      const rect = (id === undefined ? undefined : rects.get(id)) ?? frameBox

      return { rect, message: rejection.message }
    }

    if (inserting.type !== null) return at(inserting.drop?.overId, inserting.rejection)
    if (keyboardDrag !== null) return at(keyboardDrag.id, keyboardDrag.refusal)

    return at(drag.drop?.overId, drag.rejection)
  }, [
    inserting.type,
    inserting.drop,
    inserting.rejection,
    keyboardDrag,
    drag.drop,
    drag.rejection,
    rects,
    frameBox,
  ])

  const autoScroll = useAutoScroll(surface)

  /*
   * Read through a ref, and deliberately.
   *
   * The controls depend on the viewport transform, so their identity changes on
   * every pan — and auto-scroll pans. Depending on them directly made the
   * effect below tear down and re-run on each frame, calling `track(null)` in
   * its own cleanup and killing the loop it had just started. It panned by
   * exactly nothing, which looked like auto-scroll not being wired at all.
   */
  const autoScrollRef = useRef(autoScroll)
  autoScrollRef.current = autoScroll

  /*
   * Panning while a resize sits near an edge.
   *
   * The reason the resize delta counts the pan: a pointer held at the edge is
   * still travelling across the page while the canvas slides under it, so the
   * box keeps growing. Without that this would slide the canvas and stop the
   * resize, which is worse than not scrolling at all.
   *
   * Tracked from here rather than inside the gesture, because the surface and
   * the pointer's position within it are this component's to know.
   */
  useEffect(() => {
    if (!resize.resizing && !drag.dragging) return

    const move = (event: PointerEvent): void => {
      const at = localPoint(event)

      autoScrollRef.current.track({ x: at.x, y: at.y })
    }

    window.addEventListener("pointermove", move)

    return () => {
      window.removeEventListener("pointermove", move)
      autoScrollRef.current.track(null)
    }
  }, [resize.resizing, drag.dragging, localPoint])

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

        /*
         * Armed, not started. Nothing moves until the pointer travels, so a
         * click that selects is still a click — and selecting first means the
         * drag carries what the user just picked up rather than what was
         * selected before they aimed at it.
         */
        drag.begin(event)
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
          /*
           * What the pointer is doing, as a cursor.
           *
           * docs/ui-guidelines.md § Dragging: "cursor changes appropriately".
           * It did not — a node dragged across the canvas kept the default
           * arrow, so the only feedback that a drag was in progress was the
           * preview, and somebody using it reported the drag as having no
           * icon.
           *
           * `grabbing` covers both gestures that carry something: moving a
           * node, and dragging a new one out of the library. Panning keeps
           * `grab`, which is the hand that *can* take hold — it is set while
           * the space key is held, before any movement.
           */
          cursor:
            drag.dragging || inserting.type !== null ? "grabbing" : panning ? "grab" : "default",
          paddingTop: showRulers ? RULER_SIZE : 0,
          paddingLeft: showRulers ? RULER_SIZE : 0,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          /*
           * No hover while dragging.
           *
           * Mostly because it is the right behaviour: what the pointer is over
           * while something is being carried is answered by the drop
           * indicator, and an outline following the cursor as well would be two
           * answers to one question.
           *
           * It also keeps work out of the gesture. Hover decides which nodes
           * are measured, and changing it writes new rects and re-runs the
           * effect that reads the surface — both of which force a synchronous
           * layout, which docs/performance.md asks a drag not to do. I first
           * attributed a dropped frame to this and was wrong: removing it
           * changed nothing measurable. It stays on its own merits.
           */
          if (marquee !== null || panning || drag.dragging) return

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
            {page}
          </div>
        </div>

        <Overlays
          transform={viewport.transform}
          rects={rects}
          selected={selected}
          carrying={keyboardDrag?.id ?? null}
          hovered={hovered}
          labelFor={nameOf}
          guides={resize.guides}
          marquee={marquee}
          resizable={resizable}
          surfaceHeight={surface.current?.clientHeight ?? 0}
          drop={dropIndicator}
          refusal={dropRefusal}
          onResizeStart={(handle, event) => {
            // The grip owns the gesture from here, so the surface beneath it
            // must not also start a marquee.
            event.stopPropagation()
            resize.begin(handle, event)
          }}
        />
      </div>

      {/*
        Outside the gesture surface and outside the overlay layers, because it
        is neither: it draws nothing and it never receives a pointer.
      */}
      <SelectionAnnouncer />

      {/*
        The thing in the user's hand, outside the frame on purpose: the renderer
        puts a node's id in a class, and every query that looks one up is scoped
        to the frame. A preview inside it would give measurement two elements to
        choose from for one id.
      */}
      <DragPreview theme={theme} registry={registry} rects={rects} origin={drag.origin} />

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
      {/*
        Above the breadcrumb row, centred, and only while something is in the
        hand. A modal gesture that does not say it is one is a gesture nobody
        knows they are in — see CarryHint.
      */}
      <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-2">
        <CarryHint />
      </div>

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
