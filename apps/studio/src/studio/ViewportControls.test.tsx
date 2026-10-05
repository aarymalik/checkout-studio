import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CommandRegistry,
  EditorProvider,
  KeyboardProvider,
  KeymapRegistry,
  ZOOM_STEPS,
  createViewportCommands,
  useEditorStoreApi,
  type EditorStoreApi,
} from "@checkout-studio/editor"
import { createDocument } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { describe, expect, it } from "vitest"
import type { ReactElement } from "react"

import { ViewportControls } from "./ViewportControls"

/**
 * Zoom, and which device the page is being edited at.
 *
 * Every control runs a registered command, so what is tested here is the wiring
 * and what it says: that the buttons reach the same commands the keyboard does,
 * that the current state is announced rather than only coloured, and that the
 * row is absent when there is nothing to operate.
 */

function setup({ withCommands = true }: { withCommands?: boolean } = {}): {
  store: EditorStoreApi
} {
  let captured: EditorStoreApi | null = null

  function Capture(): ReactElement {
    captured = useEditorStoreApi()

    return <ViewportControls />
  }

  const commands = new CommandRegistry()
  const document = createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
  })

  function Host(): ReactElement {
    const store = useEditorStoreApi()

    if (withCommands && !commands.has("view.zoom-in")) {
      commands.registerAll(createViewportCommands({ store: () => store }))
    }

    return <Capture />
  }

  render(
    <EditorProvider document={document} baseVersion={1}>
      <KeyboardProvider commands={commands} keymap={new KeymapRegistry(commands)} platform="mac">
        {/* Every control is tooltipped, as it is in the real toolbar. */}
        <TooltipProvider>
          <Host />
        </TooltipProvider>
      </KeyboardProvider>
    </EditorProvider>,
  )

  if (captured === null) throw new Error("The provider did not render.")

  return { store: captured }
}

function percent(): string {
  return screen.getByRole("button", { name: /^Zoom, / }).textContent ?? ""
}

describe("when its commands are not registered", () => {
  it("renders nothing, rather than buttons that do nothing", () => {
    const { container } = render(
      <EditorProvider
        document={createDocument({
          projectId: "prj_test",
          pageId: "pag_test",
          themeId: "theme_default",
        })}
        baseVersion={1}
      >
        <KeyboardProvider
          commands={new CommandRegistry()}
          keymap={new KeymapRegistry(new CommandRegistry())}
          platform="mac"
        >
          <TooltipProvider>
            <ViewportControls />
          </TooltipProvider>
        </KeyboardProvider>
      </EditorProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })
})

describe("the device switcher", () => {
  it("is a group of toggles that says which is on", () => {
    setup()

    const group = screen.getByRole("group", { name: "Device" })

    expect(group).toBeInTheDocument()

    // Which one is on is state, and a screen reader needs it said rather than
    // inferred from a colour.
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "false")
  })

  it("switches the breakpoint, through the command", async () => {
    const user = userEvent.setup()
    const { store } = setup()

    await user.click(screen.getByRole("button", { name: "Mobile" }))

    expect(store.getState().viewport.breakpoint).toBe("mobile")
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "false")
  })

  it("keeps the zoom across a device switch", async () => {
    const user = userEvent.setup()
    const { store } = setup()

    await user.click(screen.getByRole("button", { name: "Zoom in" }))

    const zoomed = store.getState().viewport.zoom

    await user.click(screen.getByRole("button", { name: "Tablet" }))

    // docs/phases.md, Phase 7: "Zoom and pan state survive a device switch".
    expect(store.getState().viewport.zoom).toBe(zoomed)
  })
})

describe("the zoom controls", () => {
  it("shows the current zoom as a percentage", () => {
    const { store } = setup()

    expect(percent()).toBe("100%")
    expect(store.getState().viewport.zoom).toBe(1)
  })

  it("steps up and down through the scale", async () => {
    const user = userEvent.setup()
    const { store } = setup()

    await user.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(store.getState().viewport.zoom).toBe(ZOOM_STEPS[ZOOM_STEPS.indexOf(1) + 1])

    await user.click(screen.getByRole("button", { name: "Zoom out" }))
    expect(store.getState().viewport.zoom).toBe(1)
    expect(percent()).toBe("100%")
  })

  it("resets from the percentage itself", async () => {
    const user = userEvent.setup()
    const { store } = setup()

    await user.click(screen.getByRole("button", { name: "Zoom in" }))
    await user.click(screen.getByRole("button", { name: "Zoom in" }))

    expect(percent()).not.toBe("100%")

    // The number is the button: somebody looks at it before deciding to reset
    // it, and a separate label plus a reset button says the same thing twice.
    await user.click(screen.getByRole("button", { name: /^Zoom, / }))

    expect(store.getState().viewport.zoom).toBe(1)
    expect(percent()).toBe("100%")
  })

  it("names the percentage for a reader, not only shows it", () => {
    setup()

    // "100%" alone, announced, is a button whose purpose is a guess.
    expect(
      screen.getByRole("button", { name: "Zoom, 100 percent. Reset to 100%" }),
    ).toBeInTheDocument()
  })

  it("rounds for display without rounding the state", async () => {
    const user = userEvent.setup()
    const { store } = setup()

    store.getState().setZoom(0.75)
    await user.click(screen.getByRole("button", { name: "Zoom out" }))

    expect(store.getState().viewport.zoom).toBe(0.5)
    expect(percent()).toBe("50%")
  })

  it("stops at the ends of the scale", async () => {
    const user = userEvent.setup()
    const { store } = setup()

    store.getState().setZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1] as number)
    await user.click(screen.getByRole("button", { name: "Zoom in" }))

    expect(store.getState().viewport.zoom).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1])
    expect(percent()).toBe("400%")
  })

  it("never touches the document", async () => {
    const user = userEvent.setup()
    const { store } = setup()
    const before = store.getState().document

    await user.click(screen.getByRole("button", { name: "Zoom in" }))
    await user.click(screen.getByRole("button", { name: "Mobile" }))

    // Zooming is not an edit. It must not make the page dirty, or autosave
    // writes every time somebody looks closer at something.
    expect(store.getState().document).toBe(before)
    expect(store.getState().persistence.status).toBe("saved")
  })
})
