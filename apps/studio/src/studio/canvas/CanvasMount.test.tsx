import { render, screen } from "@testing-library/react"
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
