import { act, fireEvent, render, screen } from "@testing-library/react"
import { EditorProvider, useEditorStoreApi, type EditorStoreApi } from "@checkout-studio/editor"
import {
  createDocument,
  defaultTheme,
  type CheckoutSchema,
  type Node,
} from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"
import type { ReactElement } from "react"

import { DragPreview } from "./DragPreview"
import { fixtureRegistry } from "./fixtures"

/**
 * The thing that follows the cursor while a node is being dragged.
 *
 * The component itself rather than a grey rectangle, which means it renders a
 * subtree through the renderer — and that is where the care is needed. Two of
 * these tests exist because of mistakes made writing it: a selector that built
 * a new object every call and re-rendered for ever, and the risk that a preview
 * carrying the same classes as the real nodes becomes something measurement can
 * find.
 */

function page(): CheckoutSchema {
  const base = createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
    random: () => 0.5,
  })
  const root = base.nodes[base.root] as Node

  return {
    ...base,
    nodes: {
      ...base.nodes,
      [base.root]: { ...root, children: ["section"] },
      section: {
        id: "section",
        type: "core.section",
        parentId: base.root,
        children: [],
        props: {},
        styles: {},
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false, name: "Section" },
      },
    },
  }
}

const RECTS = new Map([["section", { x: 0, y: 0, width: 300, height: 120 }]])

function mount(origin: { x: number; y: number } | null = { x: 150, y: 60 }): {
  element: ReactElement
  store: () => EditorStoreApi
} {
  let captured: EditorStoreApi | null = null
  const registry = fixtureRegistry()

  function Capture(): ReactElement {
    captured = useEditorStoreApi()

    return <DragPreview theme={defaultTheme} registry={registry} rects={RECTS} origin={origin} />
  }

  return {
    element: (
      <EditorProvider document={page()} baseVersion={1}>
        <Capture />
      </EditorProvider>
    ),
    store: () => {
      if (captured === null) throw new Error("The provider did not mount.")

      return captured
    },
  }
}

function held(): HTMLElement {
  const node = document.querySelector<HTMLElement>("[aria-hidden='true'].fixed")

  if (node === null) throw new Error("The preview is not on screen.")

  return node
}

describe("with nothing being dragged", () => {
  it("renders nothing", () => {
    const { element } = mount()

    render(element)

    expect(document.querySelector("[aria-hidden='true'].fixed")).toBeNull()
  })
})

describe("while a node is being dragged", () => {
  it("draws the component, not a stand-in", () => {
    const mounted = mount()

    render(mounted.element)

    act(() => {
      mounted.store().getState().beginDrag(["section"])
    })

    // The fixture components carry `data-ck-node`, so finding one means the
    // renderer drew the subtree rather than this drawing a rectangle.
    expect(held().querySelector("[data-ck-node]")).not.toBeNull()
  })

  it("does not re-render for ever", () => {
    /*
     * The first version selected `{ zoom, pan }` from the store, which builds a
     * new object on every call — so the store saw a changed value on every
     * notification and React stopped it with "Maximum update depth exceeded".
     * Any render of this catches it, which is why this test is a render.
     */
    const mounted = mount()

    expect(() => {
      render(mounted.element)

      act(() => {
        mounted.store().getState().beginDrag(["section"])
      })
    }).not.toThrow()
  })

  it("stays out of the canvas frame, where measurement looks", () => {
    const mounted = mount()

    render(mounted.element)

    act(() => {
      mounted.store().getState().beginDrag(["section"])
    })

    /*
     * The renderer puts a node's id in a class and every lookup is scoped to
     * `[data-canvas-frame]`. A preview inside it would give measurement two
     * elements to choose from for one id, and the overlay would outline
     * whichever it found first.
     */
    expect(held().closest("[data-canvas-frame]")).toBeNull()
  })

  it("takes no pointer events, so the page underneath stays reachable", () => {
    const mounted = mount()

    render(mounted.element)

    act(() => {
      mounted.store().getState().beginDrag(["section"])
    })

    // The node under the cursor has to be the page, not the thing being
    // carried over it — otherwise every drop resolves against the preview.
    expect(held().className).toContain("pointer-events-none")
  })

  it("is hidden from assistive technology, which is told by the live region", () => {
    const mounted = mount()

    render(mounted.element)

    act(() => {
      mounted.store().getState().beginDrag(["section"])
    })

    expect(held().getAttribute("aria-hidden")).toBe("true")
  })

  it("follows the pointer by transform alone", () => {
    const mounted = mount()

    render(mounted.element)

    act(() => {
      mounted.store().getState().beginDrag(["section"])
    })

    act(() => {
      fireEvent.pointerMove(window, { clientX: 400, clientY: 300 })
    })

    const style = held().style

    /*
     * docs/performance.md: transform only during a drag. Writing left and top
     * would lay the page out again on every frame — and a preview is a subtree
     * of real components, so that is a real layout.
     */
    expect(style.transform).toContain("translate3d")
    expect(style.left).toBe("")
    expect(style.top).toBe("")
  })

  it("keeps the grab point under the hand", () => {
    // Picked up 150 across and 60 down into a box whose top-left is at 0,0.
    const mounted = mount({ x: 150, y: 60 })

    render(mounted.element)

    act(() => {
      mounted.store().getState().beginDrag(["section"])
    })

    act(() => {
      fireEvent.pointerMove(window, { clientX: 400, clientY: 300 })
    })

    // So the preview's own origin trails the cursor by that much, rather than
    // leaping so its corner meets the pointer.
    expect(held().style.transform).toContain("translate3d(250px, 240px, 0)")
  })
})

describe("a node that was never measured", () => {
  it("draws nothing rather than a preview with no size", () => {
    let captured: EditorStoreApi | null = null
    const registry = fixtureRegistry()

    function Capture(): ReactElement {
      captured = useEditorStoreApi()

      return (
        <DragPreview
          theme={defaultTheme}
          registry={registry}
          rects={new Map()}
          origin={{ x: 0, y: 0 }}
        />
      )
    }

    render(
      <EditorProvider document={page()} baseVersion={1}>
        <Capture />
      </EditorProvider>,
    )

    act(() => {
      captured?.getState().beginDrag(["section"])
    })

    expect(document.querySelector("[aria-hidden='true'].fixed")).toBeNull()
    expect(screen.queryByText(/section/i)).toBeNull()
  })
})
