import { act, fireEvent, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ReactNode } from "react"

import { useDrag } from "../../src/dnd/hooks"
import type { NodeRects } from "../../src/canvas/hit"
import { EditorProvider, useEditorStoreApi } from "../../src/state/context"
import type { EditorStoreApi } from "../../src/state/store"
import { documentOf } from "../documents"

/**
 * Dragging a node on the canvas.
 *
 * The gesture, driven with real pointer events against a real store. What is
 * tested is docs/phases.md Phase 8 § Integration: the order a reorder produces,
 * that a cross-container move reparents, that one drag is one undo step, and
 * that Escape leaves the tree exactly as it was.
 *
 * jsdom has no layout, so the boxes are supplied rather than measured — which
 * is the honest arrangement: what the boxes come out as is the browser's
 * business, and what the gesture does with them is answerable here.
 */

/**
 * page (0,0 400x400)
 *  ├── first (0,  0 400x100)
 *  ├── box   (0,100 400x200) — a container
 *  └── last  (0,300 400x100)
 */
function tree() {
  return documentOf("page", [
    { id: "page", type: "core.page", children: ["first", "box", "last"] },
    { id: "first", type: "core.section", name: "First" },
    { id: "box", type: "core.section", name: "Box" },
    { id: "last", type: "core.section", name: "Last" },
  ])
}

const RECTS: NodeRects = new Map([
  ["page", { x: 0, y: 0, width: 400, height: 400 }],
  ["first", { x: 0, y: 0, width: 400, height: 100 }],
  ["box", { x: 0, y: 100, width: 400, height: 200 }],
  ["last", { x: 0, y: 300, width: 400, height: 100 }],
])

/** The canvas's job in the real thing; the identity of it here. */
const toCanvas = (event: { clientX: number; clientY: number }) => ({
  x: event.clientX,
  y: event.clientY,
})

function harness() {
  let store: EditorStoreApi | null = null

  function Capture(): null {
    store = useEditorStoreApi()

    return null
  }

  const wrapper = ({ children }: { children: ReactNode }) => (
    <EditorProvider document={tree()} baseVersion={1}>
      <Capture />
      {children}
    </EditorProvider>
  )

  const { result } = renderHook(() => useDrag({ rects: RECTS, toCanvas }), { wrapper })

  if (store === null) throw new Error("The provider did not mount.")

  return { result, store: store as EditorStoreApi }
}

/** Arm a drag of whatever is selected, from a point. */
function pickUp(result: { current: ReturnType<typeof useDrag> }, at: number): void {
  act(() => {
    result.current.begin({
      button: 0,
      clientX: 200,
      clientY: at,
    } as unknown as React.PointerEvent)
  })
}

function moveTo(y: number): void {
  act(() => {
    fireEvent.pointerMove(window, { clientX: 200, clientY: y })
  })
}

function release(): void {
  act(() => {
    fireEvent.pointerUp(window)
  })
}

const childrenOfPage = (store: EditorStoreApi): readonly string[] =>
  store.getState().document.nodes["page"]?.children ?? []

describe("a click that wobbled", () => {
  it("is a click, and moves nothing", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    // Under the threshold: a pointer is never perfectly still.
    moveTo(52)

    expect(result.current.dragging).toBe(false)

    release()

    expect(childrenOfPage(store)).toEqual(["first", "box", "last"])
    expect(store.getState().history.past).toEqual([])
  })
})

describe("a pointer that is not the primary button", () => {
  it("never arms, so a right-click menu does not drag the page", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    act(() => {
      result.current.begin({
        button: 2,
        clientX: 200,
        clientY: 50,
      } as unknown as React.PointerEvent)
    })
    moveTo(398)

    expect(result.current.dragging).toBe(false)
    expect(childrenOfPage(store)).toEqual(["first", "box", "last"])
  })
})

describe("a drag that keeps moving", () => {
  it("re-resolves on every move rather than only the first", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)

    moveTo(200)
    expect(result.current.drop?.parentId).toBe("box")

    // The same gesture, somewhere else: the answer has to follow the pointer,
    // or the indicator freezes where the drag began.
    moveTo(398)
    expect(result.current.drop).toEqual({
      overId: "last",
      position: "after",
      parentId: "page",
      index: 3,
    })

    release()

    expect(childrenOfPage(store)).toEqual(["box", "last", "first"])
  })
})

describe("reordering among siblings", () => {
  it("produces the order the pointer indicated", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    // Past `last`'s bottom edge band, so "after last".
    moveTo(398)

    expect(result.current.dragging).toBe(true)
    expect(result.current.drop).toEqual({
      overId: "last",
      position: "after",
      parentId: "page",
      index: 3,
    })

    release()

    expect(childrenOfPage(store)).toEqual(["box", "last", "first"])
  })

  it("is one undo step, which fully restores the order", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    moveTo(398)
    release()

    expect(store.getState().history.past).toHaveLength(1)

    act(() => {
      store.getState().undo()
    })

    expect(childrenOfPage(store)).toEqual(["first", "box", "last"])
  })
})

describe("moving across containers", () => {
  it("reparents into the container under the pointer", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    // The middle of `box`, which takes children.
    moveTo(200)

    expect(result.current.drop?.parentId).toBe("box")

    release()

    expect(store.getState().document.nodes["first"]?.parentId).toBe("box")
    expect(childrenOfPage(store)).toEqual(["box", "last"])
  })
})

describe("several nodes at once", () => {
  it("keeps them in the order they were in", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first", "last"]))
    pickUp(result, 50)
    moveTo(200)
    release()

    // Dropped into `box` in order, not reversed: each one that lands shifts the
    // next, which is what the index increment is for.
    expect(store.getState().document.nodes["box"]?.children).toEqual(["first", "last"])
  })

  it("is still one undo step", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first", "last"]))
    pickUp(result, 50)
    moveTo(200)
    release()

    // Two moves, one thing the person did.
    expect(store.getState().history.past).toHaveLength(1)
  })
})

describe("a drag that would be refused", () => {
  it("says why, and leaves the tree alone on release", () => {
    const { result, store } = harness()

    act(() => store.getState().setLocked(["box"], true))
    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    moveTo(200)

    expect(result.current.rejection?.code).toBe("locked-destination")
    expect(result.current.rejection?.message).toBe(
      "Box is locked, so nothing can be moved into it.",
    )

    const before = store.getState().document

    release()

    expect(store.getState().document).toBe(before)
  })

  it("reports no position to the store, so nothing promises a drop", () => {
    const { result, store } = harness()

    act(() => store.getState().setLocked(["box"], true))
    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    moveTo(200)

    expect(store.getState().drag.position).toBeNull()
  })
})

describe("Escape", () => {
  it("cancels, and the tree is untouched", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    moveTo(398)

    const before = store.getState().document

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" })
    })

    expect(result.current.dragging).toBe(false)
    expect(result.current.drop).toBeNull()

    release()

    /*
     * Nothing to undo, because nothing was written. The move happens on
     * release and only on release, so cancelling is not an undo — it is the
     * absence of a change.
     */
    expect(store.getState().document).toBe(before)
    expect(store.getState().history.past).toEqual([])
  })
})

describe("keys that are not Escape, and Escape that is not a cancel", () => {
  it("leaves a stray Escape to whatever else wants it", () => {
    const { store } = harness()

    act(() => store.getState().select(["first"]))

    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true })

    act(() => {
      window.dispatchEvent(event)
    })

    /*
     * Escape also clears the selection — `selection.clear`, bound in the
     * canvas scope. Swallowing one while no drag is in progress would break
     * that, and the user would press it twice wondering why.
     */
    expect(event.defaultPrevented).toBe(false)
  })

  it("ignores other keys during a drag", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    moveTo(398)

    act(() => {
      fireEvent.keyDown(window, { key: "a" })
    })

    expect(result.current.dragging).toBe(true)
  })
})

describe("while this session may not write", () => {
  it("never arms", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    act(() => store.getState().setCanEdit(false))
    pickUp(result, 50)
    moveTo(398)

    expect(result.current.dragging).toBe(false)
  })
})

describe("with nothing selected", () => {
  it("never arms, because there is nothing to pick up", () => {
    const { result } = harness()

    pickUp(result, 50)
    moveTo(398)

    expect(result.current.dragging).toBe(false)
  })
})

describe("dragged off the page", () => {
  it("reports nowhere rather than guessing", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    moveTo(900)

    expect(result.current.drop).toBeNull()
    expect(store.getState().drag.overId).toBeNull()

    const before = store.getState().document

    release()

    expect(store.getState().document).toBe(before)
  })
})

describe("the store while a drag is in progress", () => {
  it("knows what is being dragged and where it would go", () => {
    const { result, store } = harness()

    act(() => store.getState().select(["first"]))
    pickUp(result, 50)
    moveTo(398)

    // Which is how the overlay draws it without the gesture reaching into it.
    expect(store.getState().drag.ids).toEqual(["first"])
    expect(store.getState().drag.overId).toBe("last")
    expect(store.getState().drag.position).toBe("after")

    release()

    expect(store.getState().drag.ids).toEqual([])
    expect(result.current.dragging).toBe(false)
  })
})

describe("unmounted", () => {
  it("takes its listeners off the window with it", () => {
    const added: string[] = []
    const removed: string[] = []
    const realAdd = window.addEventListener.bind(window)
    const realRemove = window.removeEventListener.bind(window)

    window.addEventListener = ((type: string, ...rest: unknown[]) => {
      added.push(type)

      return (realAdd as (...args: unknown[]) => void)(type, ...rest)
    }) as typeof window.addEventListener
    window.removeEventListener = ((type: string, ...rest: unknown[]) => {
      removed.push(type)

      return (realRemove as (...args: unknown[]) => void)(type, ...rest)
    }) as typeof window.removeEventListener

    try {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <EditorProvider document={tree()} baseVersion={1}>
          {children}
        </EditorProvider>
      )
      const { unmount } = renderHook(() => useDrag({ rects: RECTS, toCanvas }), { wrapper })

      const mine = ["pointermove", "pointerup", "keydown"]

      expect(mine.every((type) => added.includes(type))).toBe(true)

      unmount()

      /*
       * The gesture listens on the window for the life of the hook, which is
       * the life of the canvas. A canvas that unmounted and left a pointermove
       * handler behind would keep resolving drops against a store nobody is
       * looking at.
       */
      expect(mine.every((type) => removed.includes(type))).toBe(true)
    } finally {
      window.addEventListener = realAdd
      window.removeEventListener = realRemove
    }
  })
})
