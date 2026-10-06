import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CommandRegistry,
  DEFAULT_KEYMAP,
  EditorProvider,
  KeyboardProvider,
  KeymapRegistry,
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
vi.mock("@/studio/registry", () => ({ registry: fixtureRegistry() }))

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
      commands.registerAll(createViewportCommands({ store: () => store }))
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
