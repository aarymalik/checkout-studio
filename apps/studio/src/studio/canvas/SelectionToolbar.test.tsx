import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CommandRegistry,
  DEFAULT_KEYMAP,
  EditorProvider,
  KeyboardProvider,
  KeymapRegistry,
  createArrangeCommands,
  createEditCommands,
  defaultShortcuts,
  resolveShortcuts,
  useEditorStoreApi,
  type EditorStoreApi,
} from "@checkout-studio/editor"
import { createDocument, type CheckoutSchema, type Node } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { describe, expect, it } from "vitest"
import type { ReactElement } from "react"

import { SelectionToolbar } from "./SelectionToolbar"

/**
 * The inline selection toolbar.
 *
 * Mounted with the real command registry and the real keymap, because that is
 * the whole claim being tested: the buttons are a view over commands, so their
 * enabled states are the commands' answers rather than this component's
 * opinion. A harness with stub commands would test the opposite.
 */

function page(): CheckoutSchema {
  const base = createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
    random: () => 0.5,
  })
  const root = base.nodes[base.root] as Node

  const section = (id: string): Node => ({
    id,
    type: "core.section",
    parentId: base.root,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false, name: id },
  })

  return {
    ...base,
    nodes: {
      ...base.nodes,
      [base.root]: { ...root, children: ["first", "second"] },
      first: section("first"),
      second: section("second"),
    },
  }
}

const RECT = { x: 120, y: 200, width: 300, height: 80 }

function mount(
  rect: { x: number; y: number; width: number; height: number } | null = RECT,
  surfaceHeight = 900,
): { element: ReactElement; store: () => EditorStoreApi } {
  const commands = new CommandRegistry()
  const keymap = new KeymapRegistry(commands)
  let captured: EditorStoreApi | null = null

  function Capture(): ReactElement {
    const store = useEditorStoreApi()

    captured = store

    if (!commands.has("arrange.lock")) {
      commands.registerAll([
        ...createEditCommands({ store: () => store }),
        ...createArrangeCommands({ store: () => store }),
      ])
      keymap.registerAll(resolveShortcuts(defaultShortcuts, DEFAULT_KEYMAP))
    }

    return <SelectionToolbar rect={rect} surfaceHeight={surfaceHeight} />
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
      if (captured === null) throw new Error("The toolbar did not mount.")

      return captured
    },
  }
}

describe("with nothing selected", () => {
  it("renders nothing, rather than a row of controls over nothing", () => {
    const { element } = mount()

    render(element)

    expect(screen.queryByRole("toolbar", { name: "Selection" })).not.toBeInTheDocument()
  })
})

/** Rendered with something selected, which is when the toolbar exists. */
function withSelection(
  rect: { x: number; y: number; width: number; height: number } | null = RECT,
  surfaceHeight = 900,
): ReturnType<typeof mount> {
  const mounted = mount(rect, surfaceHeight)

  render(mounted.element)
  // Inside `act`, or the store write lands and React never re-renders — which
  // looks exactly like a toolbar that does not work.
  act(() => mounted.store().getState().select(["second"]))

  return mounted
}

describe("with a selection", () => {
  const selected = (): ReturnType<typeof mount> => withSelection()

  it("is a toolbar with an accessible name", () => {
    selected()

    expect(screen.getByRole("toolbar", { name: "Selection" })).toBeInTheDocument()
  })

  it("offers duplicate, delete, move and the two toggles", () => {
    selected()

    for (const label of ["Move up", "Move down", "Duplicate", "Lock", "Hide", "Delete"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
    }
  })

  it("shows each action's shortcut beside its name", async () => {
    const user = userEvent.setup()

    selected()

    await user.hover(screen.getByRole("button", { name: "Duplicate" }))

    // The binding comes from the registry, so the toolbar and the keyboard
    // cannot disagree about what the key is — and nobody has to keep a second
    // list of shortcuts in sync with the first.
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Duplicate · ⌘D")
  })

  it("has one tab stop for the group, and arrows inside it", async () => {
    const user = userEvent.setup()

    selected()

    const buttons = screen.getAllByRole("button")
    const stops = buttons.filter((button) => button.getAttribute("tabindex") === "0")

    // The WAI-ARIA toolbar pattern. Six tab stops per selection would make Tab
    // useless for anything else.
    expect(stops).toHaveLength(1)

    await user.tab()
    expect(buttons[0]).toHaveFocus()

    await user.keyboard("{ArrowRight}")
    expect(buttons[1]).toHaveFocus()

    await user.keyboard("{ArrowLeft}")
    expect(buttons[0]).toHaveFocus()

    await user.keyboard("{End}")
    expect(buttons[buttons.length - 1]).toHaveFocus()

    await user.keyboard("{Home}")
    expect(buttons[0]).toHaveFocus()
  })

  it("sits above the selection", () => {
    selected()

    const toolbar = screen.getByRole("toolbar", { name: "Selection" })

    expect(toolbar).toHaveStyle({ left: "120px" })
    // Above, which means a smaller top than the selection's own.
    expect(Number.parseInt(toolbar.style.top, 10)).toBeLessThan(RECT.y)
  })

  it("flips below when there is no room above", () => {
    withSelection({ x: 10, y: 4, width: 100, height: 50 })

    const toolbar = screen.getByRole("toolbar", { name: "Selection" })

    // A toolbar clipped by the top of the viewport is a toolbar nobody can
    // press.
    expect(Number.parseInt(toolbar.style.top, 10)).toBeGreaterThan(4)
  })

  it("runs the command rather than touching the store", async () => {
    const user = userEvent.setup()
    const mounted = selected()

    await user.click(screen.getByRole("button", { name: "Duplicate" }))

    expect(Object.keys(mounted.store().getState().document.nodes)).toHaveLength(4)
  })
})

describe("the toggles", () => {
  const selected = (): ReturnType<typeof mount> => withSelection()

  it("say whether they are on, rather than leaving it to a colour", async () => {
    const user = userEvent.setup()
    const mounted = selected()

    expect(screen.getByRole("button", { name: "Lock" })).toHaveAttribute("aria-pressed", "false")

    await user.click(screen.getByRole("button", { name: "Lock" }))

    const unlock = screen.getByRole("button", { name: "Unlock" })

    expect(unlock).toHaveAttribute("aria-pressed", "true")
    expect(mounted.store().getState().document.nodes["second"]?.metadata.locked).toBe(true)
  })

  it("hides, one way, because a hidden node has no box to hold a toolbar", async () => {
    const user = userEvent.setup()
    const mounted = selected()

    await user.click(screen.getByRole("button", { name: "Hide" }))

    expect(mounted.store().getState().document.nodes["second"]?.visibility.hidden).toBe(true)

    /*
     * Not a toggle. docs/editor-behavior.md § Hide: a hidden component remains
     * in Layers and is not rendered — so in the product the toolbar vanishes
     * with the box it was positioned from, and a "Show" state could never
     * appear.
     *
     * The previous version of this test asserted that it did, and passed: this
     * harness hands the toolbar a fixed rect, so it never loses the node. It
     * was asserting behaviour the application cannot produce — the same shape
     * as the plugin test harness that handed components empty props.
     */
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull()
    expect(screen.getByRole("button", { name: "Hide" })).not.toHaveAttribute("aria-pressed")
  })
})

describe("a locked selection", () => {
  it("keeps the toolbar, and disables what the lock forbids", async () => {
    const user = userEvent.setup()

    withSelection()

    await user.click(screen.getByRole("button", { name: "Lock" }))

    /*
     * docs/editor-behavior.md § Lock: cannot move, cannot delete, remains
     * selectable. The toolbar is not deciding any of that — the commands
     * report themselves unavailable and the buttons follow, which is why the
     * keyboard and the toolbar give the same answer.
     */
    for (const label of ["Move up", "Move down", "Delete"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-disabled", "true")
    }

    // Still reachable, or there would be no way to unlock it.
    expect(screen.getByRole("button", { name: "Unlock" })).toHaveAttribute("aria-disabled", "false")
    expect(screen.getByRole("button", { name: "Duplicate" })).toHaveAttribute(
      "aria-disabled",
      "false",
    )
  })
})

describe("a read-only session", () => {
  it("renders nothing, because every button here writes", () => {
    const mounted = withSelection()

    act(() => mounted.store().getState().setCanEdit(false))

    expect(screen.queryByRole("toolbar", { name: "Selection" })).not.toBeInTheDocument()
  })
})

describe("before the commands exist", () => {
  it("renders nothing rather than buttons that would do nothing", () => {
    const commands = new CommandRegistry()
    const keymap = new KeymapRegistry(commands)

    let captured: EditorStoreApi | null = null

    function Capture(): ReactElement {
      captured = useEditorStoreApi()

      return <SelectionToolbar rect={RECT} surfaceHeight={900} />
    }

    render(
      <EditorProvider document={page()} baseVersion={1}>
        <KeyboardProvider commands={commands} keymap={keymap} platform="mac">
          <TooltipProvider>
            <Capture />
          </TooltipProvider>
        </KeyboardProvider>
      </EditorProvider>,
    )

    act(() => captured?.getState().select(["second"]))

    expect(screen.queryByRole("toolbar", { name: "Selection" })).not.toBeInTheDocument()
  })
})
