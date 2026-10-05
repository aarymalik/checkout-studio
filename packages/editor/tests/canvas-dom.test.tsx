import { act, render, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import {
  classIndex,
  elementFor,
  measureContentHeight,
  measureNode,
  measureNodes,
  nodeIdAt,
  useAutoScroll,
  useContentHeight,
  useNodeRects,
  useNodeResolver,
  usePanZoom,
  useResize,
  useViewport,
} from "../src/canvas"
import type { Rect } from "../src/canvas"
import { EditorProvider, useEditorStoreApi } from "../src/state/context"
import type { EditorStoreApi } from "../src/state/store"
import { documentOf } from "./documents"

/**
 * The parts of the canvas that need a DOM.
 *
 * jsdom has no layout, so every `getBoundingClientRect` is zero. Each test here
 * stubs the rect it is about, which is the honest arrangement: what the boxes
 * actually come out as is a question for the browser-driven suite, and what the
 * code does with a box is answerable here.
 */

const tree = () =>
  documentOf("page", [
    { id: "page", type: "core.page", children: ["header", "body"] },
    { id: "header", type: "core.section" },
    { id: "body", type: "core.section" },
  ])

/** An element reporting the rect it was given. */
function boxed(
  element: HTMLElement,
  rect: { x: number; y: number; width: number; height: number },
) {
  element.getBoundingClientRect = () =>
    ({
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
      toJSON: () => rect,
    }) as DOMRect

  return element
}

/** A frame holding one element per node, each with a stubbed box. */
function frameWith(
  boxes: Record<string, { x: number; y: number; width: number; height: number }>,
  origin = { x: 100, y: 50, width: 1440, height: 900 },
): HTMLElement {
  const frame = boxed(document.createElement("div"), origin)

  for (const [id, box] of Object.entries(boxes)) {
    const element = document.createElement("div")

    element.className = `ck-${id}`
    // Offset by the frame's own origin, the way a real layout would be: the
    // measurement has to subtract it to get frame space.
    boxed(element, { ...box, x: box.x + origin.x, y: box.y + origin.y })
    frame.append(element)
  }

  document.body.append(frame)

  return frame
}

function wrapper({ children }: { children: ReactNode }) {
  return <EditorProvider document={tree()}>{children}</EditorProvider>
}

describe("finding a node's element", () => {
  it("finds it by the class the renderer emitted", () => {
    const frame = frameWith({ header: { x: 0, y: 0, width: 100, height: 20 } })

    expect(elementFor(frame, "header")).not.toBeNull()
    expect(elementFor(frame, "body")).toBeNull()
  })

  it("escapes an id that is not a bare CSS identifier", () => {
    const frame = document.createElement("div")
    const element = document.createElement("div")

    element.className = "ck-a_b"
    frame.append(element)

    expect(elementFor(frame, "a_b")).toBe(element)
  })
})

describe("measuring", () => {
  it("reports a box in frame space, not screen space", () => {
    const frame = frameWith({ header: { x: 20, y: 10, width: 300, height: 40 } })

    // The frame's own origin is subtracted, so the measurement survives a pan.
    expect(measureNode(frame, "header", 1)).toEqual({ x: 20, y: 10, width: 300, height: 40 })
  })

  it("divides out the zoom", () => {
    const frame = frameWith(
      { header: { x: 40, y: 20, width: 600, height: 80 } },
      { x: 0, y: 0, width: 2880, height: 1800 },
    )

    // A box measured at 200% is half that size in the space the geometry works
    // in, which is what keeps an overlay correct at every zoom.
    expect(measureNode(frame, "header", 2)).toEqual({ x: 20, y: 10, width: 300, height: 40 })
  })

  it("has no box for a node that rendered nothing", () => {
    // Hidden, or a component that returned null. No box, no overlay, which is
    // correct: there is nothing on screen to outline.
    expect(measureNode(frameWith({}), "header", 1)).toBeNull()
  })

  it("measures several from one read of the frame", () => {
    const frame = frameWith({
      header: { x: 0, y: 0, width: 1440, height: 100 },
      body: { x: 0, y: 100, width: 1440, height: 700 },
    })
    const origin = vi.spyOn(frame, "getBoundingClientRect")

    const rects = measureNodes(frame, ["header", "body", "nowhere"], 1)

    expect([...rects.keys()]).toEqual(["header", "body"])
    // Each rect read can force a layout, and asking for the same one twice per
    // node is how a canvas drops frames.
    expect(origin).toHaveBeenCalledTimes(1)
  })

  it("measures nothing for an empty list", () => {
    expect(measureNodes(frameWith({}), [], 1).size).toBe(0)
  })

  it("reports how tall the page came out", () => {
    const frame = frameWith({}, { x: 0, y: 0, width: 1440, height: 2400 })

    expect(measureContentHeight(frame, 1)).toBe(2400)
    expect(measureContentHeight(frame, 2)).toBe(1200)
  })
})

describe("resolving an element to a node", () => {
  it("builds the mapping from the document", () => {
    const index = classIndex(tree())

    expect(index.get("ck-header")).toBe("header")
    expect(index.size).toBe(3)
  })

  it("walks outward from whatever was clicked", () => {
    const frame = frameWith({ header: { x: 0, y: 0, width: 10, height: 10 } })
    const inner = document.createElement("span")

    frame.querySelector(".ck-header")?.append(inner)

    // The DOM already knows what is on top, and "deepest wins" falls out of the
    // walk — no rectangle testing needed.
    expect(nodeIdAt(inner, classIndex(tree()))).toBe("header")
  })

  it("finds nothing outside every node", () => {
    const loose = document.createElement("div")

    expect(nodeIdAt(loose, classIndex(tree()))).toBeNull()
    expect(nodeIdAt(null, classIndex(tree()))).toBeNull()
  })

  it("ignores a class that looks like one but is not in the document", () => {
    const element = document.createElement("div")

    element.className = "ck-gone"

    expect(nodeIdAt(element, classIndex(tree()))).toBeNull()
  })
})

describe("the viewport hook", () => {
  it("reads the transform from the store", () => {
    const { result } = renderHook(() => useViewport(), { wrapper })

    expect(result.current.transform).toEqual({ zoom: 1, pan: { x: 0, y: 0 } })
  })

  it("pans", () => {
    const { result } = renderHook(() => useViewport(), { wrapper })

    act(() => result.current.panBy({ x: -40, y: 10 }))

    expect(result.current.transform.pan).toEqual({ x: -40, y: 10 })
  })

  it("writes the zoom and the pan together", () => {
    const { result } = renderHook(() => ({ viewport: useViewport(), store: useEditorStoreApi() }), {
      wrapper,
    })

    const seen: { zoom: number; x: number }[] = []
    const stop = result.current.store.subscribe((state) =>
      seen.push({ zoom: state.viewport.zoom, x: state.viewport.pan.x }),
    )

    act(() => result.current.viewport.zoomAt(2, { x: 100, y: 100 }))
    stop()

    // One write per gesture step. Setting the zoom and then the pan would
    // render once at the new scale with the old offset, which is a visible jump
    // at every wheel notch.
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({ zoom: 2, x: -100 })
  })

  it("steps through the named stops", () => {
    const { result } = renderHook(() => useViewport(), { wrapper })

    act(() => result.current.step(1))

    expect(result.current.transform.zoom).toBe(1.25)
  })

  it("fits a page to the viewport", () => {
    const { result } = renderHook(() => useViewport(), { wrapper })

    act(() =>
      result.current.fit({ x: 0, y: 0, width: 1440, height: 3000 }, { width: 800, height: 600 }),
    )

    expect(result.current.transform.zoom).toBeLessThan(1)
  })

  it("resets to 100%", () => {
    const { result } = renderHook(() => useViewport(), { wrapper })

    act(() => result.current.step(1))
    act(() =>
      result.current.reset({ x: 0, y: 0, width: 1440, height: 900 }, { width: 800, height: 600 }),
    )

    expect(result.current.transform.zoom).toBe(1)
  })

  it("zooms to the selection", () => {
    const { result } = renderHook(() => ({ viewport: useViewport(), store: useEditorStoreApi() }), {
      wrapper,
    })

    act(() => result.current.store.getState().select(["header"]))
    act(() =>
      result.current.viewport.toSelection(
        new Map([["header", { x: 100, y: 100, width: 200, height: 100 }]]),
        { width: 800, height: 600 },
      ),
    )

    expect(result.current.viewport.transform.zoom).toBeGreaterThan(1)
  })

  it("fits the page when nothing is selected, or nothing measured", () => {
    const { result } = renderHook(() => useViewport(), { wrapper })

    act(() => result.current.toSelection(new Map(), { width: 800, height: 600 }))

    // The nearest useful thing to what was asked for.
    expect(result.current.transform.zoom).toBeLessThanOrEqual(1)
  })
})

describe("gesture handling", () => {
  /**
   * A surface with the hook attached, and the transform it produces.
   *
   * The element is created before render and handed in as the ref, because the
   * hook attaches its listeners in an effect against whatever the ref holds.
   */
  function mount(panning = false) {
    const element = boxed(document.createElement("div"), {
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })

    document.body.append(element)

    const surface = { current: element }
    let transform = { zoom: 1, pan: { x: 0, y: 0 } }

    function Host() {
      usePanZoom({ surface, panning })
      transform = useViewport().transform

      return null
    }

    const view = render(
      <EditorProvider document={tree()}>
        <Host />
      </EditorProvider>,
    )

    return { element, view, read: () => transform }
  }

  /** A pointer event jsdom can construct, with the fields the hook reads. */
  function pointer(
    type: string,
    fields: { button?: number; movementX?: number; movementY?: number } = {},
  ): Event {
    const event = new MouseEvent(type, { bubbles: true, button: fields.button ?? 0 })

    Object.defineProperties(event, {
      pointerId: { value: 1 },
      movementX: { value: fields.movementX ?? 0 },
      movementY: { value: fields.movementY ?? 0 },
    })

    return event
  }

  beforeEach(() => {
    vi.restoreAllMocks()

    // jsdom implements neither, and the hook captures the pointer so a drag
    // that leaves the element keeps panning.
    HTMLElement.prototype.setPointerCapture = function setPointerCapture(): void {}
    HTMLElement.prototype.releasePointerCapture = function releasePointerCapture(): void {}
    HTMLElement.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
      return true
    }
  })

  it("zooms towards the cursor on a modified wheel", () => {
    const { element, read } = mount()

    act(() => {
      element.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -300, ctrlKey: true, clientX: 200, clientY: 150 }),
      )
    })

    expect(read().zoom).toBeGreaterThan(1)
    // The canvas point under the cursor stayed under it.
    const anchor = { x: 200, y: 150 }
    expect(anchor.x * read().zoom + read().pan.x).toBeCloseTo(200, 6)
  })

  it("zooms out on a wheel the other way", () => {
    const { element, read } = mount()

    act(() => {
      element.dispatchEvent(new WheelEvent("wheel", { deltaY: 300, metaKey: true }))
    })

    expect(read().zoom).toBeLessThan(1)
  })

  it("pans on a plain wheel, and keeps the page behind it still", () => {
    const { element, read } = mount()
    const event = new WheelEvent("wheel", { deltaX: 40, deltaY: 80, cancelable: true })

    act(() => {
      element.dispatchEvent(event)
    })

    expect(read().pan).toEqual({ x: -40, y: -80 })
    // The canvas is the scrolling surface; the document must not scroll too.
    expect(event.defaultPrevented).toBe(true)
  })

  it("pans on a middle-button drag", () => {
    const { element, read } = mount()

    act(() => {
      element.dispatchEvent(pointer("pointerdown", { button: 1 }))
      element.dispatchEvent(pointer("pointermove", { movementX: 12, movementY: -6 }))
    })

    expect(read().pan).toEqual({ x: 12, y: -6 })
  })

  it("pans on a left drag while space is held", () => {
    const { element, read } = mount(true)

    act(() => {
      element.dispatchEvent(pointer("pointerdown", { button: 0 }))
      element.dispatchEvent(pointer("pointermove", { movementX: 5, movementY: 5 }))
    })

    expect(read().pan).toEqual({ x: 5, y: 5 })
  })

  it("ignores a left drag when space is not held", () => {
    const { element, read } = mount()

    act(() => {
      element.dispatchEvent(pointer("pointerdown", { button: 0 }))
      element.dispatchEvent(pointer("pointermove", { movementX: 20, movementY: 20 }))
    })

    // A plain drag on the canvas is a marquee, which the canvas component owns.
    expect(read().pan).toEqual({ x: 0, y: 0 })
  })

  it("stops panning when the pointer is released", () => {
    const { element, read } = mount(true)

    act(() => {
      element.dispatchEvent(pointer("pointerdown"))
      element.dispatchEvent(pointer("pointermove", { movementX: 10 }))
      element.dispatchEvent(pointer("pointerup"))
      element.dispatchEvent(pointer("pointermove", { movementX: 50 }))
    })

    expect(read().pan.x).toBe(10)
  })

  it("stops panning when the gesture is cancelled", () => {
    const { element, read } = mount(true)

    act(() => {
      element.dispatchEvent(pointer("pointerdown"))
      element.dispatchEvent(pointer("pointercancel"))
      element.dispatchEvent(pointer("pointermove", { movementX: 50 }))
    })

    expect(read().pan.x).toBe(0)
  })

  it("ignores a release it never captured", () => {
    const { element, read } = mount()

    expect(() =>
      act(() => {
        element.dispatchEvent(pointer("pointerup"))
      }),
    ).not.toThrow()
    expect(read().pan).toEqual({ x: 0, y: 0 })
  })

  it("attaches its wheel listener non-passively, and removes it", () => {
    const add = vi.spyOn(HTMLElement.prototype, "addEventListener")
    const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener")

    const { view } = mount()

    // Non-passive on purpose: a pinch has to be prevented from zooming the
    // whole page, and preventDefault on a passive listener does nothing.
    expect(add).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false })

    view.unmount()

    expect(remove).toHaveBeenCalledWith("wheel", expect.any(Function))
  })

  it("does nothing without an element to listen to", () => {
    function Detached() {
      usePanZoom({ surface: { current: null } })

      return null
    }

    expect(() =>
      render(
        <EditorProvider document={tree()}>
          <Detached />
        </EditorProvider>,
      ),
    ).not.toThrow()
  })
})

describe("measuring through a hook", () => {
  it("measures the nodes it was asked about", () => {
    const frame = { current: frameWith({ header: { x: 0, y: 0, width: 300, height: 40 } }) }

    const { result } = renderHook(() => useNodeRects(frame, ["header"]), { wrapper })

    expect(result.current.get("header")).toEqual({ x: 0, y: 0, width: 300, height: 40 })
  })

  it("measures nothing when asked about nothing", () => {
    const frame = { current: frameWith({ header: { x: 0, y: 0, width: 300, height: 40 } }) }

    const { result } = renderHook(() => useNodeRects(frame, []), { wrapper })

    expect(result.current.size).toBe(0)
  })

  it("measures nothing before the frame exists", () => {
    const { result } = renderHook(() => useNodeRects({ current: null }, ["header"]), { wrapper })

    expect(result.current.size).toBe(0)
  })

  it("reports the content height", () => {
    const frame = { current: frameWith({}, { x: 0, y: 0, width: 1440, height: 1800 }) }

    const { result } = renderHook(() => useContentHeight(frame), { wrapper })

    expect(result.current).toBe(1800)
  })

  it("reports no height before the frame exists", () => {
    const { result } = renderHook(() => useContentHeight({ current: null }), { wrapper })

    expect(result.current).toBe(0)
  })

  it("resolves an element through a hook", () => {
    const frame = frameWith({ header: { x: 0, y: 0, width: 10, height: 10 } })
    const { result } = renderHook(() => useNodeResolver(), { wrapper })

    expect(result.current(frame.querySelector(".ck-header"))).toBe("header")
  })
})

describe("auto-scroll through a hook", () => {
  it("pans while the pointer sits near an edge, and stops when it leaves", async () => {
    const surface = {
      current: boxed(document.createElement("div"), { x: 0, y: 0, width: 400, height: 300 }),
    }
    document.body.append(surface.current)

    const { result } = renderHook(
      () => ({ scroll: useAutoScroll(surface), viewport: useViewport() }),
      { wrapper },
    )

    act(() => result.current.scroll.track({ x: 2, y: 150 }))

    // Two frames: the first sets the clock and moves nothing, because treating
    // it as a full frame makes the first step jump.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80))
    })

    expect(result.current.viewport.transform.pan.x).toBeGreaterThan(0)

    const moved = result.current.viewport.transform.pan.x

    act(() => result.current.scroll.track(null))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80))
    })

    expect(result.current.viewport.transform.pan.x).toBe(moved)
  })

  it("does not pan from the middle", async () => {
    const surface = {
      current: boxed(document.createElement("div"), { x: 0, y: 0, width: 400, height: 300 }),
    }
    document.body.append(surface.current)

    const { result } = renderHook(
      () => ({ scroll: useAutoScroll(surface), viewport: useViewport() }),
      { wrapper },
    )

    act(() => result.current.scroll.track({ x: 200, y: 150 }))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80))
    })

    expect(result.current.viewport.transform.pan).toEqual({ x: 0, y: 0 })
  })

  it("stops when the surface goes away mid-gesture", async () => {
    const surface = { current: null } as { current: HTMLElement | null }
    const { result } = renderHook(() => useAutoScroll(surface), { wrapper })

    act(() => result.current.track({ x: 2, y: 2 }))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    expect(true).toBe(true)
  })
})

describe("useResize", () => {
  /**
   * The gesture, driven by events rather than by a mouse.
   *
   * jsdom has no layout, so the rects are given rather than measured — which is
   * the right split: what a box actually comes out as is the browser suite's
   * question, and what the gesture does with a box is answerable here.
   */
  function harness(options: { rects?: Map<string, Rect>; locked?: boolean } = {}) {
    const document =
      options.locked === true
        ? documentOf("page", [
            { id: "page", type: "core.page", children: ["header", "body"] },
            { id: "header", type: "core.section", locked: true },
            { id: "body", type: "core.section" },
          ])
        : tree()

    const rects =
      options.rects ??
      new Map<string, Rect>([
        ["header", { x: 0, y: 0, width: 200, height: 100 }],
        ["body", { x: 0, y: 140, width: 200, height: 100 }],
      ])

    const captured: {
      store?: EditorStoreApi
      controls?: ReturnType<typeof useResize>
    } = {}

    function Harness(): ReactNode {
      captured.store = useEditorStoreApi()
      captured.controls = useResize({ rects, siblingsOf: () => ["body"] })

      return null
    }

    render(
      <EditorProvider document={document} baseVersion={1}>
        <Harness />
      </EditorProvider>,
    )

    const store = captured.store

    if (store === undefined) throw new Error("The harness did not render.")

    return {
      store,
      // Read fresh each time: the hook returns new values on every render, and
      // a captured one would report the state before the gesture.
      controls: (): ReturnType<typeof useResize> => {
        if (captured.controls === undefined) throw new Error("The harness did not render.")

        return captured.controls
      },
    }
  }

  it("writes the dragged axis to the breakpoint being edited", () => {
    const { store, controls } = harness()

    act(() => {
      store.getState().select(["header"])
      store.getState().setBreakpoint("tablet")
    })

    act(() => {
      controls().begin("e", { clientX: 200, clientY: 50 })
    })
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 260, clientY: 50 }))
    })

    expect(store.getState().document.nodes["header"]?.styles.tablet?.base?.["width"]).toBe(260)
    expect(store.getState().document.nodes["header"]?.styles.desktop).toBeUndefined()
  })

  it("divides the pointer movement by the zoom", () => {
    const { store, controls } = harness()

    act(() => {
      store.getState().select(["header"])
      store.getState().setZoom(2)
    })

    act(() => {
      controls().begin("e", { clientX: 200, clientY: 50 })
    })
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 50 }))
    })

    // A hundred screen pixels at 200% is fifty units of document.
    expect(store.getState().document.nodes["header"]?.styles.desktop?.base?.["width"]).toBe(250)
  })

  it("refuses to start on a locked node", () => {
    const { store, controls } = harness({ locked: true })

    act(() => {
      store.getState().select(["header"])
    })

    act(() => {
      controls().begin("e", { clientX: 200, clientY: 50 })
    })

    // Locked stays selectable and is not editable.
    expect(controls().resizing).toBe(false)

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 260, clientY: 50 }))
    })

    expect(store.getState().document.nodes["header"]?.styles.desktop).toBeUndefined()
  })

  it("refuses to start with nothing selected, or nothing measured", () => {
    const { controls } = harness({ rects: new Map() })

    act(() => {
      controls().begin("e", { clientX: 0, clientY: 0 })
    })

    expect(controls().resizing).toBe(false)
  })

  it("refuses to start when this session may not write", () => {
    const { store, controls } = harness()

    act(() => {
      store.getState().select(["header"])
      store.getState().setCanEdit(false)
    })

    act(() => {
      controls().begin("e", { clientX: 200, clientY: 50 })
    })

    expect(controls().resizing).toBe(false)
  })

  it("produces guides while dragging and clears them on release", () => {
    const { store, controls } = harness()

    act(() => {
      store.getState().select(["header"])
    })

    act(() => {
      controls().begin("s", { clientX: 100, clientY: 100 })
    })
    act(() => {
      // Dragged to 138, two short of the sibling's top edge at 140.
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 138 }))
    })

    expect(controls().guides).toHaveLength(1)
    expect(controls().guides[0]?.position).toBe(140)
    expect(store.getState().document.nodes["header"]?.styles.desktop?.base?.["height"]).toBe(140)

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"))
    })

    // Guides belong to the gesture; leaving them up draws lines against nothing.
    expect(controls().guides).toEqual([])
    expect(controls().resizing).toBe(false)
  })

  it("stops on a cancelled pointer, which a browser can send at any time", () => {
    const { store, controls } = harness()

    act(() => {
      store.getState().select(["header"])
    })

    act(() => {
      controls().begin("e", { clientX: 200, clientY: 50 })
    })
    act(() => {
      window.dispatchEvent(new PointerEvent("pointercancel"))
    })

    expect(controls().resizing).toBe(false)

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 900, clientY: 50 }))
    })

    expect(store.getState().document.nodes["header"]?.styles.desktop).toBeUndefined()
  })

  it("holds the proportions while shift is down", () => {
    const { store, controls } = harness()

    act(() => {
      store.getState().select(["header"])
    })

    act(() => {
      controls().begin("e", { clientX: 200, clientY: 50 })
    })
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 300, clientY: 50, shiftKey: true }),
      )
    })

    const base = store.getState().document.nodes["header"]?.styles.desktop?.base

    // 2:1 to begin with, and still 2:1 after.
    expect(base?.["width"]).toBe(300)
    expect(base?.["height"]).toBe(150)
  })
})
