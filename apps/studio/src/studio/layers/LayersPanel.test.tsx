import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorProvider } from "@checkout-studio/editor"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"
import { describe, expect, it, vi } from "vitest"

import { LayersPanel } from "./LayersPanel"

/**
 * The Layers panel.
 *
 * The pure logic — flattening, windowing, search, the moves a keystroke
 * produces — is tested in packages/editor. What is tested here is the part only
 * a mounted panel can answer: that it is a tree to a screen reader, that a
 * keystroke reaches the store, and that it renders a window rather than a
 * document.
 */

interface Spec {
  id: string
  type?: string
  children?: readonly string[]
  name?: string
  locked?: boolean
  hidden?: boolean
}

function documentOf(root: string, specs: readonly Spec[]): CheckoutSchema {
  const parents = new Map<string, string>()

  for (const spec of specs) {
    for (const child of spec.children ?? []) parents.set(child, spec.id)
  }

  const nodes: Record<string, Node> = {}

  for (const spec of specs) {
    nodes[spec.id] = {
      id: spec.id,
      type: spec.type ?? "core.container",
      parentId: parents.get(spec.id) ?? null,
      children: [...(spec.children ?? [])],
      props: {},
      styles: {},
      visibility: { hidden: spec.hidden ?? false },
      animations: [],
      metadata: {
        locked: spec.locked ?? false,
        ...(spec.name === undefined ? {} : { name: spec.name }),
      },
    }
  }

  return {
    version: "1.0.0",
    projectId: "prj_test",
    pageId: "pag_test",
    theme: { themeId: "theme_test" },
    settings: {},
    variables: {},
    root,
    nodes,
  }
}

/**
 * ```
 * page
 * ├── Header
 * │   └── Title
 * └── Body
 *     └── Card
 *         └── Buy now
 * ```
 */
function tree(): CheckoutSchema {
  return documentOf("page", [
    { id: "page", type: "core.page", children: ["header", "body"] },
    { id: "header", type: "core.section", name: "Header", children: ["title"] },
    { id: "title", type: "core.heading", name: "Title" },
    { id: "body", type: "core.section", name: "Body", children: ["card"] },
    { id: "card", type: "core.container", name: "Card", children: ["button"] },
    { id: "button", type: "core.button", name: "Buy now" },
  ])
}

function mount(document: CheckoutSchema = tree()) {
  return render(
    <EditorProvider document={document} baseVersion={1}>
      <LayersPanel />
    </EditorProvider>,
  )
}

function rowNamed(name: string): HTMLElement {
  const row = screen.getByRole("button", { name }).closest('[role="treeitem"]')

  if (row === null) throw new Error(`No row for "${name}".`)

  return row as HTMLElement
}

describe("structure", () => {
  it("is a tree, with the depth a screen reader needs", () => {
    mount()

    expect(screen.getByRole("tree", { name: "Layers" })).toBeInTheDocument()

    // Indentation is the sighted reader's version of this. aria-level is the
    // other reader's, and a flat list of rows has to carry it explicitly.
    expect(rowNamed("Header")).toHaveAttribute("aria-level", "1")
    expect(rowNamed("Title")).toHaveAttribute("aria-level", "2")
    expect(rowNamed("Buy now")).toHaveAttribute("aria-level", "3")
  })

  it("leaves the page itself out", () => {
    mount()

    // The root is not selectable on the canvas. A row that cannot be chosen
    // teaches people to stop trying.
    expect(screen.queryByRole("button", { name: "Page" })).toBeNull()
    expect(screen.getAllByRole("treeitem")).toHaveLength(5)
  })

  it("is one tab stop, not one per row", () => {
    mount()

    expect(screen.getByRole("tree")).toHaveAttribute("tabindex", "0")

    for (const row of screen.getAllByRole("treeitem")) {
      expect(row).not.toHaveAttribute("tabindex")
    }
  })

  it("says so when the page is empty", () => {
    mount(documentOf("page", [{ id: "page", type: "core.page" }]))

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument()
  })
})

describe("virtualization", () => {
  it("keeps the scrollbar honest about what is not rendered", () => {
    const ids = Array.from({ length: 100 }, (_, index) => `n${index}`)
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ids },
      ...ids.map((id) => ({ id, type: "core.button", name: id })),
    ])

    mount(document)

    // The box the tree is positioned inside, which is what gives the scroller
    // its length.
    const sized = screen.getByRole("tree").parentElement

    // 100 rows at 28px. A window that reports only its own height gives the
    // user a scrollbar that stops before the list does.
    expect(sized?.style.height).toBe("2800px")
  })
})

describe("two thousand nodes", () => {
  /** A flat page of `count` buttons, which is the shape that stresses the list. */
  function wide(count: number): CheckoutSchema {
    const ids = Array.from({ length: count }, (_, index) => `n${index}`)

    return documentOf("page", [
      { id: "page", type: "core.page", children: ids },
      ...ids.map((id) => ({ id, type: "core.button", name: id })),
    ])
  }

  it("renders a bounded number of rows however long the document is", () => {
    const { unmount } = mount(wide(200))
    const small = screen.getAllByRole("treeitem").length

    unmount()
    mount(wide(2_000))

    /*
     * The same window, ten times the document.
     *
     * This is the property the 100ms target in docs/phases.md rests on: the
     * panel's work is a function of the viewport, not of the page.
     *
     * Asserted structurally rather than by timing it. A ratio of two wall-clock
     * measurements was here and it measured the machine — the 200-row run is
     * sub-millisecond, so under load the noise is larger than the signal and
     * the ratio fails for reasons that have nothing to do with the panel. The
     * millisecond figure belongs in the browser benchmark, where a frame budget
     * means something.
     */
    expect(screen.getAllByRole("treeitem")).toHaveLength(small)
  })
})

describe("selection", () => {
  it("selects the node a row names", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Card" }))

    expect(rowNamed("Card")).toHaveAttribute("aria-selected", "true")
    expect(rowNamed("Buy now")).toHaveAttribute("aria-selected", "false")
  })

  it("points the keyboard at the row it is on", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Header" }))

    expect(screen.getByRole("tree")).toHaveAttribute("aria-activedescendant", rowNamed("Header").id)
  })

  it("moves down the visible rows, not the siblings", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Header" }))
    await user.keyboard("{ArrowDown}")

    // Header's child, because that is the next row on screen. Stepping to Body
    // would skip everything the user can see between them.
    expect(rowNamed("Title")).toHaveAttribute("aria-selected", "true")
  })

  it("collapses and expands with the arrows", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Body" }))
    await user.keyboard("{ArrowLeft}")

    expect(rowNamed("Body")).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "Card" })).toBeNull()

    await user.keyboard("{ArrowRight}")

    expect(screen.getByRole("button", { name: "Card" })).toBeInTheDocument()
  })

  it("reveals a row that was collapsed when it is selected", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Collapse Body" }))
    expect(screen.queryByRole("button", { name: "Buy now" })).toBeNull()

    // What selecting on the canvas does. Scrolling to a row inside a collapsed
    // parent would scroll to a row that was never rendered.
    await user.click(screen.getByRole("button", { name: "Body" }))
    await user.keyboard("{ArrowRight}{ArrowDown}{ArrowDown}")

    expect(screen.getByRole("button", { name: "Buy now" })).toBeInTheDocument()
  })
})

describe("hide and lock", () => {
  it("hides a node and says it is hidden", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Hide Card" }))

    const action = screen.getByRole("button", { name: "Show Card" })

    expect(action).toHaveAttribute("aria-pressed", "true")
  })

  it("locks a node without hiding it", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Lock Title" }))

    expect(screen.getByRole("button", { name: "Unlock Title" })).toBeInTheDocument()
    // Locking stops a node being edited, not being looked at.
    expect(screen.getByRole("button", { name: "Hide Title" })).toBeInTheDocument()
  })

  it("still lets the keyboard reach a locked row", async () => {
    const user = userEvent.setup()
    mount(
      documentOf("page", [
        { id: "page", type: "core.page", children: ["a", "b"] },
        { id: "a", type: "core.button", name: "First", locked: true },
        { id: "b", type: "core.button", name: "Second" },
      ]),
    )

    await user.click(screen.getByRole("button", { name: "Second" }))
    await user.keyboard("{ArrowUp}")

    // A user has to be able to reach a locked row to unlock it.
    expect(rowNamed("First")).toHaveAttribute("aria-selected", "true")
  })
})

describe("reorder", () => {
  it("moves a row among its siblings with alt and the arrows", async () => {
    const user = userEvent.setup()
    mount(
      documentOf("page", [
        { id: "page", type: "core.page", children: ["a", "b"] },
        { id: "a", type: "core.button", name: "First" },
        { id: "b", type: "core.button", name: "Second" },
      ]),
    )

    const order = (): readonly string[] =>
      screen
        .getAllByRole("treeitem")
        .map((row) => within(row).getAllByRole("button")[0]?.textContent ?? "")

    expect(order()).toEqual(["First", "Second"])

    await user.click(screen.getByRole("button", { name: "Second" }))
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}")

    expect(order()).toEqual(["Second", "First"])
  })

  it("changes depth with alt and the sideways arrows", async () => {
    const user = userEvent.setup()
    mount(
      documentOf("page", [
        { id: "page", type: "core.page", children: ["a", "b"] },
        { id: "a", type: "core.container", name: "Box" },
        { id: "b", type: "core.button", name: "Second" },
      ]),
    )

    await user.click(screen.getByRole("button", { name: "Second" }))
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}")

    expect(rowNamed("Second")).toHaveAttribute("aria-level", "2")

    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}")

    expect(rowNamed("Second")).toHaveAttribute("aria-level", "1")
  })
})

describe("drag reorder", () => {
  /**
   * docs/phases.md Phase 8: drag reorder in the Layers panel.
   *
   * jsdom lays nothing out, so the scroller's box is zero and the pointer's y
   * is its client y — which is exactly the space the panel works in. Rows are a
   * fixed `ROW_HEIGHT` by design, so a row's band is arithmetic rather than a
   * measurement, and that is what these drive.
   */
  const ROW = 28

  /** A point a fraction of the way into the row at `index`. */
  const at = (index: number, fraction: number): number => index * ROW + ROW * fraction

  const order = (): readonly string[] =>
    screen
      .getAllByRole("treeitem")
      .map((row) => within(row).getAllByRole("button")[0]?.textContent ?? "")

  function flat() {
    return documentOf("page", [
      { id: "page", type: "core.page", children: ["a", "b", "c"] },
      { id: "a", type: "core.button", name: "First" },
      { id: "b", type: "core.button", name: "Second" },
      { id: "c", type: "core.button", name: "Third" },
    ])
  }

  /** Drag the row named `name` to a point, and release. */
  function dragTo(name: string, y: number): void {
    const row = rowNamed(name)

    fireEvent.pointerDown(row, { button: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientY: y })
    fireEvent.pointerUp(window)
  }

  it("moves a row to where the pointer says", () => {
    mount(flat())

    expect(order()).toEqual(["First", "Second", "Third"])

    // The bottom third of the last row: after it.
    dragTo("First", at(2, 0.9))

    expect(order()).toEqual(["Second", "Third", "First"])
  })

  it("drops into a container when the pointer is in its middle", () => {
    mount(
      documentOf("page", [
        { id: "page", type: "core.page", children: ["box", "b"] },
        { id: "box", type: "core.container", name: "Box" },
        { id: "b", type: "core.button", name: "Second" },
      ]),
    )

    dragTo("Second", at(0, 0.5))

    // Inside `Box`, which means a level deeper.
    expect(rowNamed("Second")).toHaveAttribute("aria-level", "2")
  })

  it("shows where it would land before the pointer comes up", () => {
    mount(flat())

    const row = rowNamed("First")

    fireEvent.pointerDown(row, { button: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientY: at(2, 0.9) })

    /*
     * The criterion is that the drop position is always shown before release.
     * The line is drawn inside the row it would arrive at, because a
     * virtualized list has no "between" to render into.
     */
    const target = rowNamed("Third")

    expect(target.querySelector("[aria-hidden='true'].absolute")).not.toBeNull()

    fireEvent.pointerUp(window)
  })

  it("is a click when the pointer barely moved", () => {
    mount(flat())

    const row = rowNamed("First")

    fireEvent.pointerDown(row, { button: 0, clientY: 0 })
    // Under the threshold: a pointer is never perfectly still.
    fireEvent.pointerMove(window, { clientY: 2 })
    fireEvent.pointerUp(window)

    expect(order()).toEqual(["First", "Second", "Third"])
  })

  it("cancels on Escape, leaving the order alone", () => {
    mount(flat())

    const row = rowNamed("First")

    fireEvent.pointerDown(row, { button: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientY: at(2, 0.9) })
    fireEvent.keyDown(window, { key: "Escape" })
    fireEvent.pointerUp(window)

    // Nothing was written, so cancelling is the absence of a change.
    expect(order()).toEqual(["First", "Second", "Third"])
  })

  it("refuses to drop a row inside itself", () => {
    mount(
      documentOf("page", [
        { id: "page", type: "core.page", children: ["box", "b"] },
        { id: "box", type: "core.container", name: "Box", children: ["inner"] },
        { id: "inner", type: "core.button", name: "Inner" },
        { id: "b", type: "core.button", name: "Second" },
      ]),
    )

    // Row 0 is Box itself; its middle means "inside Box".
    dragTo("Box", at(0, 0.5))

    // The same rule the canvas drag applies, through the same function.
    expect(rowNamed("Box")).toHaveAttribute("aria-level", "1")
  })

  it("opens a collapsed container the drag rests on", () => {
    vi.useFakeTimers()

    try {
      mount(
        documentOf("page", [
          { id: "page", type: "core.page", children: ["box", "b"] },
          { id: "box", type: "core.container", name: "Box", children: ["inner"] },
          { id: "inner", type: "core.button", name: "Inner" },
          { id: "b", type: "core.button", name: "Second" },
        ]),
      )

      // Collapse Box, so its child is not on screen to aim at.
      fireEvent.click(screen.getByRole("button", { name: "Collapse Box" }))
      expect(screen.queryByRole("button", { name: "Inner" })).not.toBeInTheDocument()

      const row = rowNamed("Second")

      fireEvent.pointerDown(row, { button: 0, clientY: at(1, 0.5) })
      fireEvent.pointerMove(window, { clientY: at(0, 0.5) })

      /*
       * Without this a collapsed container can only be dropped beside, never
       * into: its children are not on screen, so there is no row to aim at and
       * no way to reach them without putting the drag down first.
       */
      act(() => {
        vi.advanceTimersByTime(600)
      })

      expect(screen.getByRole("button", { name: "Inner" })).toBeInTheDocument()

      fireEvent.pointerUp(window)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not open one the drag merely crosses", () => {
    vi.useFakeTimers()

    try {
      mount(
        documentOf("page", [
          { id: "page", type: "core.page", children: ["box", "b"] },
          { id: "box", type: "core.container", name: "Box", children: ["inner"] },
          { id: "inner", type: "core.button", name: "Inner" },
          { id: "b", type: "core.button", name: "Second" },
        ]),
      )

      fireEvent.click(screen.getByRole("button", { name: "Collapse Box" }))

      const row = rowNamed("Second")

      fireEvent.pointerDown(row, { button: 0, clientY: at(1, 0.5) })
      fireEvent.pointerMove(window, { clientY: at(0, 0.5) })

      // Moved on before the delay elapsed.
      act(() => {
        vi.advanceTimersByTime(200)
      })
      fireEvent.pointerMove(window, { clientY: at(1, 0.9) })
      act(() => {
        vi.advanceTimersByTime(600)
      })

      /*
       * A panel that unfolded every container the pointer passed over would
       * rearrange itself under the drag, which is the one thing a drag cannot
       * survive.
       */
      expect(screen.queryByRole("button", { name: "Inner" })).not.toBeInTheDocument()

      fireEvent.pointerUp(window)
    } finally {
      vi.useRealTimers()
    }
  })

  it("leaves it open after the drag ends", () => {
    vi.useFakeTimers()

    try {
      mount(
        documentOf("page", [
          { id: "page", type: "core.page", children: ["box", "b"] },
          { id: "box", type: "core.container", name: "Box", children: ["inner"] },
          { id: "inner", type: "core.button", name: "Inner" },
          { id: "b", type: "core.button", name: "Second" },
        ]),
      )

      fireEvent.click(screen.getByRole("button", { name: "Collapse Box" }))

      const row = rowNamed("Second")

      fireEvent.pointerDown(row, { button: 0, clientY: at(1, 0.5) })
      fireEvent.pointerMove(window, { clientY: at(0, 0.5) })
      act(() => {
        vi.advanceTimersByTime(600)
      })
      fireEvent.pointerUp(window)

      // Closing it again would undo something the user watched happen, and
      // they can close it themselves.
      expect(screen.getByRole("button", { name: "Inner" })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("will not move a locked row", () => {
    mount(
      documentOf("page", [
        { id: "page", type: "core.page", children: ["a", "b"] },
        { id: "a", type: "core.button", name: "First", locked: true },
        { id: "b", type: "core.button", name: "Second" },
      ]),
    )

    dragTo("First", at(1, 0.9))

    // docs/editor-behavior.md § Lock: a locked component cannot move.
    expect(order()).toEqual(["First", "Second"])
  })
})

describe("rename", () => {
  it("renames in place, starting from the name on screen", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Card" }))
    await user.keyboard("{F2}")

    const field = screen.getByRole("textbox", { name: "Rename Card" })

    // Selected on open, so typing replaces rather than appends: a rename is
    // almost always a new name.
    await user.keyboard("Summary{Enter}")

    expect(screen.getByRole("tree")).toHaveFocus()

    expect(field).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Summary" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Card" })).toBeNull()
  })

  it("abandons the rename on Escape", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Card" }))
    await user.keyboard("{F2}Summary{Escape}")

    expect(screen.getByRole("button", { name: "Card" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Summary" })).toBeNull()
  })

  it("leaves Enter to the tree, which docs/keyboard-shortcuts.md reserves", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Card" }))
    await user.keyboard("{Enter}")

    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("returns focus to the tree, so the keyboard keeps working", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Card" }))
    await user.keyboard("{F2}{Escape}")

    expect(screen.getByRole("tree")).toHaveFocus()

    await user.keyboard("{ArrowDown}")

    expect(rowNamed("Buy now")).toHaveAttribute("aria-selected", "true")
  })

  it("falls back to the component's own name when cleared", async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByRole("button", { name: "Buy now" }))
    await user.keyboard("{F2}")
    await user.clear(screen.getByRole("textbox", { name: "Rename Buy now" }))
    await user.keyboard("{Enter}")

    expect(screen.getByRole("button", { name: "Button" })).toBeInTheDocument()
  })

  it("starts a rename on double click", async () => {
    const user = userEvent.setup()
    mount()

    await user.dblClick(screen.getByRole("button", { name: "Title" }))

    expect(screen.getByRole("textbox", { name: "Rename Title" })).toBeInTheDocument()
  })
})

describe("search", () => {
  it("keeps the ancestors of a match, so each result reads in context", async () => {
    const user = userEvent.setup()
    mount()

    await user.type(screen.getByRole("searchbox", { name: "Search layers" }), "buy")

    expect(screen.getByRole("button", { name: "Buy now" })).toBeInTheDocument()
    // Without the chain above it, the user sees a row and cannot tell which
    // card it belongs to.
    expect(screen.getByRole("button", { name: "Card" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Header" })).toBeNull()
  })

  it("says nothing matched rather than showing an empty tree", async () => {
    const user = userEvent.setup()
    mount()

    await user.type(screen.getByRole("searchbox", { name: "Search layers" }), "zzz")

    expect(screen.getByText("No matches")).toBeInTheDocument()
    expect(screen.queryByRole("tree")).toBeNull()
  })

  it("offers the search even when the page is empty of matches", async () => {
    const user = userEvent.setup()
    mount()

    await user.type(screen.getByRole("searchbox", { name: "Search layers" }), "zzz")

    // The field has to survive its own empty result, or clearing the search
    // means finding the field again.
    expect(screen.getByRole("searchbox", { name: "Search layers" })).toBeInTheDocument()
  })
})
