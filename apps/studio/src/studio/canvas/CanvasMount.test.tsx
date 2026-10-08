import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CommandRegistry,
  DEFAULT_KEYMAP,
  EditorProvider,
  KeyboardProvider,
  KeymapRegistry,
  createArrangeCommands,
  createDndCommands,
  labelFor,
  createEditCommands,
  createSelectionCommands,
  createViewportCommands,
  defaultShortcuts,
  resolveShortcuts,
  useEditorStoreApi,
  type EditorStoreApi,
} from "@checkout-studio/editor"
import {
  createDocument,
  defaultTheme,
  type CheckoutSchema,
  type Node,
} from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

import { fixtureRegistry } from "./fixtures"

// The registry this build ships is empty, so the canvas never mounts. The
// fixtures are what docs/phases.md Phase 7 calls for: components registered
// from the test suite, so the canvas around them can be tested at all.
const fixtures = fixtureRegistry()

/*
 * `host` too, because the canvas area reads it to say which plugin failed when
 * nothing is registered. A mock missing it is a module that throws on import.
 */
vi.mock("@/studio/registry", () => ({ registry: fixtures, host: { records: () => [] } }))

const { CanvasArea } = await import("./CanvasArea")

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

/**
 * The shell's keyboard, as the application builds it.
 *
 * The real keymap and the real commands, so a binding that would not resolve in
 * the product does not resolve here either.
 */
function mount(options: { theme?: typeof defaultTheme | null } = {}): {
  element: ReactElement
  store: () => EditorStoreApi
} {
  const commands = new CommandRegistry()
  const keymap = new KeymapRegistry(commands)
  let captured: EditorStoreApi | null = null

  function Capture(): ReactElement {
    const store = useEditorStoreApi()

    captured = store

    if (!commands.has("view.zoom-in")) {
      // The editing and arranging commands too, because the inline toolbar is
      // a view over them: without them registered it renders nothing, which
      // would make a test of it pass for the wrong reason.
      commands.registerAll([
        ...createViewportCommands({ store: () => store }),
        ...createEditCommands({ store: () => store }),
        ...createArrangeCommands({ store: () => store }),
        ...createSelectionCommands({ store: () => store }),
        /*
         * With the rules the application passes, which is the point of
         * building the harness out of the real commands: without
         * `canHaveChildren` a keyboard drag steps into a component that holds
         * nothing, and without `nameOf` a refusal has no name to use.
         */
        ...createDndCommands({
          store: () => store,
          canHaveChildren: (node) => fixtures.get(node.type)?.container ?? true,
          nameOf: labelFor,
        }),
      ])
      keymap.registerAll(resolveShortcuts(defaultShortcuts, DEFAULT_KEYMAP))
    }

    return <CanvasArea theme={options.theme === undefined ? defaultTheme : options.theme} />
  }

  return {
    element: (
      <EditorProvider document={page()} baseVersion={1}>
        <KeyboardProvider commands={commands} keymap={keymap} platform="mac">
          <TooltipProvider>
            <Capture />
          </TooltipProvider>
        </KeyboardProvider>
      </EditorProvider>
    ),
    store: () => {
      if (captured === null) throw new Error("The provider did not render.")

      return captured
    },
  }
}

describe("the canvas, with components to draw", () => {
  it("mounts rather than showing the empty state", () => {
    render(mount().element)

    // The whole point of the fixtures: past "No components yet" and into the
    // canvas, which is where resizing, guides and auto-scroll live.
    expect(screen.queryByText("No components yet")).toBeNull()
    expect(screen.getByRole("main", { name: "Canvas" })).toBeInTheDocument()
  })

  it("draws the page through the renderer, not a placeholder", () => {
    const { container } = render(mount().element)

    // Both of them: a container that dropped its children would render a
    // one-node page however deep the document.
    expect(container.querySelector('[data-fixture="core.page"]')).toBeInTheDocument()
    expect(container.querySelector('[data-fixture="core.section"]')).toBeInTheDocument()

    // No unsupported cards: the components resolve.
    expect(container.querySelector("[data-ck-unsupported]")).toBeNull()
  })
})

describe("what the canvas tells the store about itself", () => {
  /**
   * Published so that something which is not the canvas can act on its shape.
   *
   * jsdom reports zero for `clientWidth`, so the surface is stubbed — what is
   * being tested is that the measurement reaches the store at all, and that the
   * frame follows the breakpoint. Whether the numbers are right is a question
   * for a browser.
   */
  function stubSurface(width: number, height: number): () => void {
    const widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width)
    const heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height)

    return () => {
      widthSpy.mockRestore()
      heightSpy.mockRestore()
    }
  }

  it("publishes the surface, so fitting has something to fit into", () => {
    const restore = stubSurface(800, 600)

    try {
      const harness = mount()

      render(harness.element)

      expect(harness.store().getState().viewport.measured.surface).toEqual({
        width: 800,
        height: 600,
      })
    } finally {
      restore()
    }
  })

  it("publishes a frame that follows the device", () => {
    const restore = stubSurface(800, 600)

    try {
      const harness = mount()

      render(harness.element)

      const desktop = harness.store().getState().viewport.measured.frame.width

      act(() => {
        harness.store().getState().setBreakpoint("mobile")
      })

      const mobile = harness.store().getState().viewport.measured.frame.width

      // A stale frame fits to the page the user used to be looking at.
      expect(mobile).toBeLessThan(desktop)
    } finally {
      restore()
    }
  })

  it("publishes the selection, and nothing when there is none", () => {
    const restore = stubSurface(800, 600)

    try {
      const harness = mount()

      render(harness.element)

      expect(harness.store().getState().viewport.measured.selection).toBeNull()

      act(() => {
        harness.store().getState().select(["section"])
      })

      // Measured, even though jsdom's rect is zero — what matters here is that
      // a selection produces a box rather than null.
      expect(harness.store().getState().viewport.measured.selection).not.toBeNull()
    } finally {
      restore()
    }
  })
})

describe("the canvas keyboard scope", () => {
  /**
   * Shift and a letter, live only while the canvas is mounted.
   *
   * This is the whole reason these three were held back: a character key
   * shortcut needs WCAG 2.1.4's focus exemption, and the canvas scope is what
   * provides it. Without the fixtures the canvas never mounts, so there was
   * nothing to prove it against.
   */
  it("switches the breakpoint on shift and a letter", async () => {
    const user = userEvent.setup()
    const harness = mount()

    render(harness.element)

    await user.keyboard("{Shift>}M{/Shift}")
    expect(harness.store().getState().viewport.breakpoint).toBe("mobile")

    await user.keyboard("{Shift>}T{/Shift}")
    expect(harness.store().getState().viewport.breakpoint).toBe("tablet")

    await user.keyboard("{Shift>}D{/Shift}")
    expect(harness.store().getState().viewport.breakpoint).toBe("desktop")
  })

  it("zooms to fit on the key the spec advertises", async () => {
    const user = userEvent.setup()
    const widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800)
    const heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)

    try {
      const harness = mount()

      render(harness.element)

      act(() => {
        harness.store().getState().setZoom(4)
      })

      await user.keyboard("{Shift>}1{/Shift}")

      // Shift and a digit, live only in the canvas scope — which is also the
      // only time there is a surface to fit into.
      expect(harness.store().getState().viewport.zoom).toBeLessThan(4)
    } finally {
      widthSpy.mockRestore()
      heightSpy.mockRestore()
    }
  })

  it("does not switch it from outside the canvas", async () => {
    const user = userEvent.setup()
    // No page, so no canvas, so no canvas scope — and the keystroke is a plain
    // capital letter again.
    const harness = mount({ theme: null })

    render(harness.element)

    expect(screen.getByText("No page open")).toBeInTheDocument()

    await user.keyboard("{Shift>}M{/Shift}")

    expect(harness.store().getState().viewport.breakpoint).toBe("desktop")
  })

  it("leaves a capital letter alone while a field has focus", async () => {
    const user = userEvent.setup()
    const harness = mount()

    render(
      <>
        {harness.element}
        <input aria-label="Somewhere to type" />
      </>,
    )

    await user.click(screen.getByRole("textbox", { name: "Somewhere to type" }))
    await user.keyboard("{Shift>}M{/Shift}")

    // The text guard: typing a capital M types a capital M.
    expect(screen.getByRole("textbox", { name: "Somewhere to type" })).toHaveValue("M")
    expect(harness.store().getState().viewport.breakpoint).toBe("desktop")
  })
})

describe("navigating by keyboard", () => {
  /**
   * Phase 7's last exit criterion: full canvas navigation by keyboard.
   *
   * Driven through the real canvas and the real keymap, because the thing that
   * was missing was never the store — `selectSibling` and friends have worked
   * since Phase 5. What was missing was a scope, a command and a binding, and
   * only a test that presses a key can tell whether all three are there.
   */
  it("walks the siblings with Tab, and the tree with Enter", async () => {
    const harness = mount()

    render(harness.element)

    // A child to walk into. The shared fixture has none, and other tests here
    // depend on its shape.
    let child = ""

    act(() => {
      // `insertNew` answers with the document, not the id — and it selects what
      // it inserted, which is the handle on it.
      harness.store().getState().insertNew("core.section", "section")
      child = harness.store().getState().selection.ids[0] ?? ""
      harness.store().getState().select(["section"])
    })

    expect(child).not.toBe("")

    // `canvas.selection` is pushed by an effect, so the scope is not live
    // until it has run.
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Section")
    })

    act(() => {
      fireEvent.keyDown(window, { code: "Enter", key: "Enter" })
    })

    expect(harness.store().getState().selection.ids).toEqual([child])

    act(() => {
      fireEvent.keyDown(window, { code: "Enter", key: "Enter", shiftKey: true })
    })

    expect(harness.store().getState().selection.ids).toEqual(["section"])
  })

  it("clears the selection on Escape, which is what lets Tab leave", async () => {
    const harness = mount()

    render(harness.element)

    act(() => {
      harness.store().getState().select(["section"])
    })

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Section")
    })

    act(() => {
      fireEvent.keyDown(window, { code: "Escape", key: "Escape" })
    })

    expect(harness.store().getState().selection.ids).toEqual([])
  })

  it("announces the selection, because none of this moves focus", async () => {
    const harness = mount()

    render(harness.element)

    // Nothing is announced as nothing, rather than as silence.
    expect(screen.getByRole("status")).toHaveTextContent("Nothing selected")

    act(() => {
      harness.store().getState().select(["section"])
    })

    /*
     * The position too. "Section" twice in a row is indistinguishable from a
     * key that did nothing, which is what Tab would sound like without it.
     */
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Section, 1 of 1")
    })

    act(() => {
      harness.store().getState().setLocked(["section"], true)
    })

    expect(screen.getByRole("status")).toHaveTextContent("locked")
  })
})

describe("moving a node with the keyboard", () => {
  /**
   * Phase 8's accessibility criteria: keyboard drag reachable and completable,
   * every drop position announced, Escape cancels and restores.
   *
   * Driven with real keystrokes through the real keymap, because the thing
   * being tested is partly the keymap: `↵` and `Escape` are bound in
   * `canvas.selection` as well, and what makes the drag win is a deeper scope
   * rather than anything either binding knows.
   */
  function lifted(harness: ReturnType<typeof mount>): string {
    let second = ""

    act(() => {
      harness.store().getState().insertNew("core.section", harness.store().getState().document.root)
      second = harness.store().getState().selection.ids[0] ?? ""
      harness.store().getState().select(["section"])
    })

    expect(second).not.toBe("")

    act(() => {
      fireEvent.keyDown(window, { code: "KeyM", key: "m" })
    })

    return second
  }

  it("picks a node up on M and announces where it is", async () => {
    const harness = mount()

    render(harness.element)
    lifted(harness)

    expect(harness.store().getState().drag.keyboard?.id).toBe("section")

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/Section/)
    })
  })

  it("announces each position as the arrows move it", async () => {
    const harness = mount()

    render(harness.element)
    lifted(harness)

    const before = screen.getByRole("status").textContent

    act(() => {
      fireEvent.keyDown(window, { code: "ArrowDown", key: "ArrowDown" })
    })

    // The announcement has to change, or a screen reader user cannot tell a
    // key that moved something from one that did nothing.
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).not.toBe(before)
    })
  })

  it("says why, when a step is refused", async () => {
    const harness = mount()

    render(harness.element)

    /*
     * The fixture's own section, renamed and locked, with the lifted node
     * below it — so stepping *in* aims at the sibling above, which is the one
     * step that aims at a container whether or not it already holds anything.
     */
    act(() => {
      const state = harness.store().getState()

      state.rename("section", "Footer")
      state.setLocked(["section"], true)
      state.insertNew("core.section", state.document.root)
    })

    // Two renders, deliberately: `canvas.dragging` is a scope the canvas
    // enters once the store holds a drag, so the arrow is not bound until
    // React has seen the pick-up.
    act(() => {
      fireEvent.keyDown(window, { code: "KeyM", key: "m" })
    })

    act(() => {
      fireEvent.keyDown(window, { code: "ArrowRight", key: "ArrowRight" })
    })

    /*
     * Phase 8's third exit criterion, on both channels. A refused step leaves
     * the position alone, so a red indicator would be the only signal and the
     * live region would be handed the sentence it already holds — which a live
     * region does not announce. The arrow was indistinguishable from a key
     * that is not bound.
     */
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Footer is locked, so nothing can be moved into it.",
      )
    })

    /*
     * And on the canvas, for everybody who is not using a screen reader. The
     * drawn layer is queried on purpose: the sentence is in the live region
     * too, and finding it once anywhere would pass with the visible half
     * missing.
     */
    const drawn = window.document.querySelector("[data-canvas-overlays]")

    if (drawn === null) throw new Error("The overlay layer did not render.")

    expect(
      within(drawn as HTMLElement).getByText("Footer is locked, so nothing can be moved into it."),
    ).toBeInTheDocument()
  })

  it("names the component in the refusal rather than its id", async () => {
    const harness = mount()

    render(harness.element)

    act(() => {
      const state = harness.store().getState()

      // Left unnamed, so the only name available is the one derived from the
      // type.
      state.setLocked(["section"], true)
      state.insertNew("core.section", state.document.root)
    })

    // Two renders, deliberately: `canvas.dragging` is a scope the canvas
    // enters once the store holds a drag, so the arrow is not bound until
    // React has seen the pick-up.
    act(() => {
      fireEvent.keyDown(window, { code: "KeyM", key: "m" })
    })

    act(() => {
      fireEvent.keyDown(window, { code: "ArrowRight", key: "ArrowRight" })
    })

    /*
     * `labelFor` humanises the type, which is what the layers panel and the
     * hover label already use — so a refusal cannot call a node something the
     * rest of the editor does not. Before this, every sentence the drag layer
     * built named a node the user had never seen: "nod_8f2a is locked".
     */
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/^Section is locked/)
    })
  })

  it("drops on Enter as one history entry", () => {
    const harness = mount()

    render(harness.element)
    lifted(harness)

    const steps = harness.store().getState().history.past.length

    act(() => {
      fireEvent.keyDown(window, { code: "ArrowDown", key: "ArrowDown" })
    })
    act(() => {
      fireEvent.keyDown(window, { code: "Enter", key: "Enter" })
    })

    expect(harness.store().getState().drag.keyboard).toBeNull()
    expect(harness.store().getState().history.past).toHaveLength(steps + 1)
  })

  it("puts it back on Escape, with nothing to undo", () => {
    const harness = mount()

    render(harness.element)
    lifted(harness)

    const before = harness.store().getState().document
    const steps = harness.store().getState().history.past.length

    act(() => {
      fireEvent.keyDown(window, { code: "ArrowDown", key: "ArrowDown" })
    })
    act(() => {
      fireEvent.keyDown(window, { code: "Escape", key: "Escape" })
    })

    expect(harness.store().getState().drag.keyboard).toBeNull()
    // Cancelling is the absence of a change, not the reversal of one: the move
    // is only written on the drop.
    expect(harness.store().getState().document).toBe(before)
    expect(harness.store().getState().history.past).toHaveLength(steps)
  })

  it("lets Enter mean 'step into' again once nothing is held", () => {
    const harness = mount()

    render(harness.element)

    const child = lifted(harness)

    act(() => {
      fireEvent.keyDown(window, { code: "Escape", key: "Escape" })
    })

    // `canvas.dragging` is gone, so `↵` resolves to `selection.enter` — which
    // is the whole point of deciding this with a scope.
    act(() => {
      harness.store().getState().move(child, "section")
    })
    act(() => {
      harness.store().getState().select(["section"])
    })
    act(() => {
      fireEvent.keyDown(window, { code: "Enter", key: "Enter" })
    })

    expect(harness.store().getState().selection.ids).toEqual([child])
  })
})

describe("resizing by a handle", () => {
  /**
   * jsdom lays nothing out, so every measured rect is zero.
   *
   * The gesture still runs, which is what is being tested: the pointer maths,
   * the write, the breakpoint it lands on, and the grips appearing at all. What
   * a real browser would add is whether the box visibly follows the pointer,
   * and that belongs in the benchmark harness where there is layout.
   */
  function stubLayout(width: number, height: number): void {
    Element.prototype.getBoundingClientRect = function rect(): DOMRect {
      return {
        x: 0,
        y: 0,
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        toJSON: () => ({}),
      } as DOMRect
    }
  }

  it("offers eight grips on the selection", async () => {
    const user = userEvent.setup()
    const harness = mount()

    render(harness.element)

    act(() => {
      harness.store().getState().select(["section"])
    })

    const grips = await screen.findAllByRole("button", { name: /^Resize / })

    expect(grips).toHaveLength(8)
    await user.click(grips[0] as HTMLElement)
  })

  it("offers the inline toolbar on the selection", async () => {
    const harness = mount()

    render(harness.element)

    expect(screen.queryByRole("toolbar", { name: "Selection" })).not.toBeInTheDocument()

    act(() => {
      harness.store().getState().select(["section"])
    })

    /*
     * Through the real canvas, not handed a rect.
     *
     * SelectionToolbar.test.tsx mounts the component directly, which proves
     * what it does with a box but not that anything gives it one. Six features
     * in this project were built, tested and reached by nothing; this is the
     * test that would have caught that for this one.
     */
    expect(await screen.findByRole("toolbar", { name: "Selection" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument()
  })

  it("keeps the inline toolbar out of the decoration, which is hidden", async () => {
    const harness = mount()

    render(harness.element)

    act(() => {
      harness.store().getState().select(["section"])
    })

    const toolbar = await screen.findByRole("toolbar", { name: "Selection" })

    // Six labelled buttons. `aria-hidden` on them would hide the whole toolbar
    // from assistive technology, which is what happened to the grips.
    expect(toolbar.closest("[aria-hidden='true']")).toBeNull()
  })

  it("keeps the grips out of the decoration, which is hidden", async () => {
    const harness = mount()

    render(harness.element)

    act(() => {
      harness.store().getState().select(["section"])
    })

    const grip = await screen.findByRole("button", { name: "Resize nw" })

    /*
     * The bug this guards.
     *
     * Every grip is a labelled button, and all eight sat inside the overlay's
     * `aria-hidden` layer — so no assistive technology could perceive them at
     * all, and `aria-hidden` on something interactive is an ARIA violation
     * besides. Finding them by role is what caught it: they rendered, and
     * `getByRole` could not see them.
     */
    expect(grip.closest("[aria-hidden='true']")).toBeNull()
  })

  it("offers none on a locked node, which stays selected", () => {
    const harness = mount()

    render(harness.element)

    act(() => {
      harness.store().getState().setLocked(["section"], true)
      harness.store().getState().select(["section"])
    })

    // Selectable and outlined, with nothing to drag — grips that refused the
    // drag would be a worse way to say the same thing.
    expect(screen.queryAllByRole("button", { name: /^Resize / })).toHaveLength(0)
    expect(harness.store().getState().selection.ids).toEqual(["section"])
  })

  it("writes a width to the breakpoint being edited", async () => {
    const original = Element.prototype.getBoundingClientRect

    stubLayout(200, 100)

    try {
      const harness = mount()

      render(harness.element)

      act(() => {
        harness.store().getState().setBreakpoint("mobile")
        harness.store().getState().select(["section"])
      })

      const grip = await screen.findByRole("button", { name: "Resize e" })

      fireEvent.pointerDown(grip, { clientX: 200, clientY: 50 })
      fireEvent.pointerMove(window, { clientX: 260, clientY: 50 })
      fireEvent.pointerUp(window)

      const styles = harness.store().getState().document.nodes["section"]?.styles

      // Mobile, not desktop: a width set at one breakpoint must not become the
      // width at another.
      expect(styles?.mobile?.base?.["width"]).toBe(260)
      expect(styles?.desktop).toBeUndefined()
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })

  it("writes only the axis the grip owns", async () => {
    const original = Element.prototype.getBoundingClientRect

    stubLayout(200, 100)

    try {
      const harness = mount()

      render(harness.element)

      act(() => {
        harness.store().getState().select(["section"])
      })

      const grip = await screen.findByRole("button", { name: "Resize e" })

      fireEvent.pointerDown(grip, { clientX: 200, clientY: 50 })
      fireEvent.pointerMove(window, { clientX: 240, clientY: 400 })
      fireEvent.pointerUp(window)

      const base = harness.store().getState().document.nodes["section"]?.styles.desktop?.base

      // A wobbly horizontal drag must not freeze the height of a box that was
      // sizing itself to its content.
      expect(base?.["width"]).toBe(240)
      expect(base?.["height"]).toBeUndefined()
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })

  it("is one undo, not one per pointer move", async () => {
    const original = Element.prototype.getBoundingClientRect

    stubLayout(200, 100)

    try {
      const harness = mount()

      render(harness.element)

      act(() => {
        harness.store().getState().select(["section"])
      })

      const before = harness.store().getState().history.past.length
      const grip = await screen.findByRole("button", { name: "Resize e" })

      fireEvent.pointerDown(grip, { clientX: 200, clientY: 50 })

      for (let at = 210; at <= 260; at += 10) {
        fireEvent.pointerMove(window, { clientX: at, clientY: 50 })
      }

      fireEvent.pointerUp(window)

      // Six writes, one entry: setStyles groups by node and breakpoint, and the
      // window is measured against the last entry, so a continuous drag
      // collapses however long it lasts.
      expect(harness.store().getState().history.past.length).toBe(before + 1)
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })

  it("pans the canvas while the pointer sits at the edge, and stops after", async () => {
    const original = Element.prototype.getBoundingClientRect

    stubLayout(200, 100)

    try {
      const harness = mount()

      render(harness.element)

      act(() => {
        harness.store().getState().select(["section"])
      })

      const grip = await screen.findByRole("button", { name: "Resize e" })

      fireEvent.pointerDown(grip, { clientX: 200, clientY: 50 })

      /*
       * At the right-hand edge of a 200-wide surface, which is where auto-scroll
       * is supposed to take over.
       *
       * It pans on animation frames, so this waits for one rather than
       * asserting immediately — and asserts the pan moved at all rather than by
       * how much, since the velocity curve is the autoscroll module's own test.
       */
      fireEvent.pointerMove(window, { clientX: 199, clientY: 50 })

      await waitFor(() => {
        expect(harness.store().getState().viewport.pan.x).not.toBe(0)
      })

      const panned = harness.store().getState().viewport.pan.x

      fireEvent.pointerUp(window)

      // Released, so it has to stop: a canvas that kept scrolling after the
      // gesture would be unusable.
      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(harness.store().getState().viewport.pan.x).toBe(panned)
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })

  it("stops writing once the pointer is released", async () => {
    const original = Element.prototype.getBoundingClientRect

    stubLayout(200, 100)

    try {
      const harness = mount()

      render(harness.element)

      act(() => {
        harness.store().getState().select(["section"])
      })

      const grip = await screen.findByRole("button", { name: "Resize e" })

      fireEvent.pointerDown(grip, { clientX: 200, clientY: 50 })
      fireEvent.pointerMove(window, { clientX: 240, clientY: 50 })
      fireEvent.pointerUp(window)

      const settled = harness.store().getState().document.nodes["section"]?.styles.desktop?.base

      // A listener that outlived the gesture would resize whatever the pointer
      // passed over next.
      fireEvent.pointerMove(window, { clientX: 900, clientY: 50 })

      expect(harness.store().getState().document.nodes["section"]?.styles.desktop?.base).toEqual(
        settled,
      )
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })
})
