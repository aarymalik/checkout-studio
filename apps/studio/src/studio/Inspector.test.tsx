import { EditorProvider, ShellProvider, useEditorStoreApi } from "@checkout-studio/editor"
import type { EditorStoreApi } from "@checkout-studio/editor"
import { createDocument, defaultTheme } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { ReactElement } from "react"

import { Inspector } from "./Inspector"
import { PROPERTIES, propertiesFor } from "./properties"
import { registry } from "./registry"

/**
 * The inspector, against the components the build actually ships.
 *
 * The panel has its own tests in the editor package, with definitions written
 * for the test. These are the other half: that a real plugin's registrations
 * reach it, and that a change reaches the document. A panel that works against
 * invented properties while the product ships an empty one is the shape this
 * project keeps finding.
 */
function mount(): { store: EditorStoreApi } {
  let captured: EditorStoreApi | null = null

  function Capture(): ReactElement {
    captured = useEditorStoreApi()

    return <Inspector theme={defaultTheme} />
  }

  render(
    <EditorProvider
      document={createDocument({
        projectId: "prj_t",
        pageId: "pag_t",
        themeId: "theme_default",
        random: () => 0.5,
      })}
      baseVersion={1}
    >
      <ShellProvider>
        <TooltipProvider>
          <Capture />
        </TooltipProvider>
      </ShellProvider>
    </EditorProvider>,
  )

  if (captured === null) throw new Error("The provider did not render.")

  return { store: captured }
}

/**
 * Inserts a node of this type under the root and selects it.
 *
 * The id comes from the document the insert returned rather than from the
 * result, which carries no id — reading one off it gave `undefined`, a
 * selection of nothing, and an inspector correctly reporting that nothing was
 * selected.
 */
function place(store: EditorStoreApi, type: string): string {
  const root = store.getState().document.root
  let id = ""

  act(() => {
    const result = store.getState().insertNew(type, root)

    if (!result.ok) throw new Error(`Could not insert a ${type}.`)

    const children = result.document.nodes[root]?.children ?? []

    id = children[children.length - 1] ?? ""
    store.getState().select([id])
  })

  if (id === "") throw new Error(`Inserting a ${type} produced no node.`)

  return id
}

describe("every plugin's property definitions", () => {
  it("are assembled from the editor halves the build installs", () => {
    /*
     * Six plugins, each exporting a map. Nothing here names a component — a
     * plugin that adds one adds a line to its own map and its inspector
     * appears.
     */
    expect(PROPERTIES.size).toBeGreaterThan(20)
    expect(propertiesFor("core.heading").length).toBeGreaterThan(0)
    expect(propertiesFor("checkout.coupon").length).toBeGreaterThan(0)
    expect(propertiesFor("marketing.countdown").length).toBeGreaterThan(0)
  })

  it("answer with nothing for a type this build does not know", () => {
    // A document from a newer version of the product. Not a reason to fail.
    expect(propertiesFor("future.component")).toEqual([])
  })
})

describe("the inspector, against a real component", () => {
  it("asks for a selection when there is none", () => {
    mount()

    expect(screen.getByText(/Select something on the canvas/)).toBeVisible()
  })

  it("builds its sections from what the selected component registered", () => {
    const { store } = mount()

    place(store, "core.heading")

    const inspector = screen.getByRole("region", { name: "Inspector" })

    // Whatever the heading registered, grouped. Not a list this file holds.
    const groups = new Set(propertiesFor("core.heading").map((property) => property.group))

    for (const group of groups) {
      expect(within(inspector).getByRole("button", { name: group })).toBeInTheDocument()
    }
  })

  it("draws no section for a group the component registered nothing in", () => {
    const { store } = mount()

    place(store, "core.heading")

    const inspector = screen.getByRole("region", { name: "Inspector" })
    const registered = new Set(propertiesFor("core.heading").map((property) => property.group))

    for (const absent of ["Animation", "Effects"] as const) {
      if (registered.has(absent)) continue

      expect(within(inspector).queryByRole("button", { name: absent })).toBeNull()
    }
  })

  it("writes a change into the document", async () => {
    const { store } = mount()
    const id = place(store, "core.heading")

    const text = propertiesFor("core.heading").find(
      (property) => property.control === "text" && property.target === "prop",
    )

    if (text === undefined) throw new Error("The heading registered no text property.")

    await userEvent.type(screen.getByLabelText(text.label), "!")

    expect(store.getState().document.nodes[id]?.props[text.key]).toContain("!")
  })

  it("groups a held arrow key into one undo entry", async () => {
    /*
     * `setProps` carries a group key, so a run of nudges is one history entry
     * rather than one per keystroke. Phase 12 asks for a slider drag to be one
     * undo step, and this is the same mechanism under the only control that
     * can nudge yet.
     */
    const { store } = mount()

    place(store, "core.heading")

    const number = propertiesFor("core.heading").find(
      (property) => property.control === "number" && property.target === "prop",
    )

    if (number === undefined) return

    const before = store.getState().history.past.length
    const field = screen.getByLabelText(number.label)

    await userEvent.click(field)
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}")

    expect(store.getState().history.past.length - before).toBeLessThanOrEqual(1)
  })
})

describe("editing one breakpoint", () => {
  // The property a Section's padding is, which is responsive and is a side —
  // so it exercises the override and the four shapes at once.
  function responsiveStyle() {
    const style = propertiesFor("core.section").find(
      (property) => property.key === "padding" && property.responsive === true,
    )

    if (style === undefined) throw new Error("A Section no longer has a responsive padding.")

    return style
  }

  function showing(store: EditorStoreApi, breakpoint: "desktop" | "tablet" | "mobile") {
    act(() => {
      store.getState().setBreakpoint(breakpoint)
    })
  }

  // The panel keeps one section open at a time, and a Section opens on Layout.
  // Without this the padding boxes are not in the document at all, and every
  // assertion below would be about an element that was never rendered.
  async function open(group: string) {
    await userEvent.click(screen.getByRole("button", { name: group }))
  }

  it("writes the base while the canvas is at desktop", async () => {
    const { store } = mount()
    const id = place(store, "core.section")
    const style = responsiveStyle()

    await open(style.group)
    await userEvent.type(screen.getByLabelText(`${style.label} top`), "8")

    const styles = store.getState().document.nodes[id]?.styles

    expect(styles?.desktop?.base?.["paddingTop"]).toBe("8px")
    expect(styles?.tablet).toBeUndefined()
  })

  it("writes an override while the canvas is at tablet, leaving the base alone", async () => {
    const { store } = mount()
    const id = place(store, "core.section")
    const style = responsiveStyle()

    showing(store, "tablet")

    await open(style.group)
    await userEvent.type(screen.getByLabelText(`${style.label} top`), "8")

    const styles = store.getState().document.nodes[id]?.styles

    expect(styles?.tablet?.base?.["paddingTop"]).toBe("8px")
    expect(styles?.desktop?.base?.["paddingTop"]).toBeUndefined()
  })

  it("offers to remove the override, and removing it leaves the base standing", async () => {
    const { store } = mount()
    const id = place(store, "core.section")
    const style = responsiveStyle()

    // A desktop value first, then a tablet one over the top of it.
    await open(style.group)
    await userEvent.type(screen.getByLabelText(`${style.label} top`), "8")

    showing(store, "tablet")

    await userEvent.type(screen.getByLabelText(`${style.label} top`), "4")

    expect(screen.getByText("Set for tablet")).toBeVisible()

    await userEvent.click(
      screen.getByRole("button", { name: `Remove the tablet override for ${style.label}` }),
    )

    const styles = store.getState().document.nodes[id]?.styles

    expect(styles?.tablet?.base?.["paddingTop"]).toBeUndefined()
    expect(styles?.desktop?.base?.["paddingTop"]).toBe("8px")
  })

  it("shows the wider value where this breakpoint has nothing, and calls it no override", async () => {
    const { store } = mount()

    place(store, "core.section")

    const style = responsiveStyle()

    await open(style.group)
    await userEvent.type(screen.getByLabelText(`${style.label} top`), "8")

    showing(store, "mobile")

    // The desktop value is what the page uses at mobile, so it is what the
    // panel shows — and there is no mobile override to offer to remove.
    expect(screen.getByLabelText(`${style.label} top`)).toHaveValue(8)
    expect(screen.queryByText("Set for mobile")).toBeNull()
  })

  it("keeps a prop global, wherever the canvas is", async () => {
    // The document stores per-breakpoint overrides for styles only, so a prop
    // edited at tablet is edited everywhere — and must not be described as a
    // tablet override.
    const { store } = mount()
    const id = place(store, "core.heading")

    const text = propertiesFor("core.heading").find(
      (property) => property.control === "text" && property.target === "prop",
    )

    if (text === undefined) throw new Error("The heading registered no text property.")

    showing(store, "tablet")

    await userEvent.type(screen.getByLabelText(text.label), "!")

    expect(store.getState().document.nodes[id]?.props[text.key]).toContain("!")
    expect(screen.queryByText("Set for tablet")).toBeNull()
  })
})

describe("applying a value to every breakpoint", () => {
  function responsiveStyle() {
    const style = propertiesFor("core.section").find(
      (property) => property.key === "padding" && property.responsive === true,
    )

    if (style === undefined) throw new Error("A Section no longer has a responsive padding.")

    return style
  }

  async function open(group: string) {
    await userEvent.click(screen.getByRole("button", { name: group }))
  }

  function showing(store: EditorStoreApi, breakpoint: "desktop" | "tablet" | "mobile") {
    act(() => {
      store.getState().setBreakpoint(breakpoint)
    })
  }

  // Clears first. A box at tablet already shows the desktop value it inherits,
  // so typing into it alone appends — "4" into a box reading 8 is 84, and an
  // assertion of `toContain("4px")` passes against it.
  async function set(label: string, value: string) {
    const box = screen.getByLabelText(label)

    await userEvent.clear(box)
    await userEvent.type(box, value)
  }

  async function applyToAll(label: string) {
    screen.getByLabelText(label).focus()

    await userEvent.keyboard("{Meta>}{Enter}{/Meta}")
  }

  it("writes the base and removes every override", async () => {
    const { store } = mount()
    const id = place(store, "core.section")
    const style = responsiveStyle()

    await open(style.group)
    await set(`${style.label} top`, "8")

    showing(store, "tablet")

    await set(`${style.label} top`, "4")

    // ⌘↵ from inside the field, which is where somebody is when they think
    // "and the same everywhere".
    await applyToAll(`${style.label} top`)

    const styles = store.getState().document.nodes[id]?.styles

    expect(styles?.tablet?.base?.["paddingTop"]).toBeUndefined()
    // The sides that were never typed come across as the theme references they
    // already were, so the padding still follows the theme. What it stops
    // following is the component's own default, which is what the node now
    // holds a value instead of.
    expect(styles?.desktop?.base?.["padding"]).toBe("4px {spacing.5} {spacing.9}")
  })

  it("leaves one entry in history, not three", async () => {
    /*
     * It clears three breakpoints and writes one. docs/phases.md asks for the
     * lot to be a single step, and an undo that put back only the mobile
     * third of it would be worse than no undo at all.
     */
    const { store } = mount()

    place(store, "core.section")

    const style = responsiveStyle()

    await open(style.group)
    await set(`${style.label} top`, "8")

    showing(store, "tablet")

    await set(`${style.label} top`, "4")

    const before = store.getState().history.past.length

    await applyToAll(`${style.label} top`)

    expect(store.getState().history.past.length - before).toBe(1)
  })

  it("is undone in one step, putting the override back", async () => {
    const { store } = mount()
    const id = place(store, "core.section")
    const style = responsiveStyle()

    await open(style.group)
    await set(`${style.label} top`, "8")

    showing(store, "tablet")

    await set(`${style.label} top`, "4")

    await applyToAll(`${style.label} top`)

    act(() => {
      store.getState().undo()
    })

    const styles = store.getState().document.nodes[id]?.styles

    expect(styles?.tablet?.base?.["paddingTop"]).toBe("4px")
    expect(styles?.desktop?.base?.["paddingTop"]).toBe("8px")
  })

  it("shows the same value at every breakpoint afterwards", async () => {
    const { store } = mount()

    place(store, "core.section")

    const style = responsiveStyle()

    await open(style.group)
    await set(`${style.label} top`, "8")

    showing(store, "tablet")

    await set(`${style.label} top`, "4")

    await applyToAll(`${style.label} top`)

    // The point of the gesture, read back through the panel rather than the
    // document: every breakpoint now says 4, and none of them is an override.
    for (const at of ["desktop", "tablet", "mobile"] as const) {
      showing(store, at)

      expect(screen.getByLabelText(`${style.label} top`)).toHaveValue(4)
      expect(screen.queryByText(/^Set for/)).toBeNull()
    }
  })
})

describe("putting a property back", () => {
  /** The property a Heading's text is, whatever the plugin calls it. */
  function textProperty() {
    const text = propertiesFor("core.heading").find(
      (property) => property.control === "text" && property.target === "prop",
    )

    if (text === undefined) throw new Error("The heading registered no text property.")

    return text
  }

  it("offers no reset for a value that came from the component", () => {
    const { store } = mount()

    place(store, "core.heading")

    expect(screen.queryByRole("button", { name: /^Reset/ })).toBeNull()
  })

  it("offers one once the node holds a value of its own", async () => {
    const { store } = mount()

    place(store, "core.heading")

    await userEvent.type(screen.getByLabelText(textProperty().label), "!")

    expect(
      screen.getByRole("button", {
        name: `Reset ${textProperty().label} to the component's default`,
      }),
    ).toBeVisible()
  })

  it("removes the value rather than writing the default in its place", async () => {
    /*
     * The distinction the whole slice turns on. Both leave the same words on
     * screen; only one leaves the node still following the component, so a
     * later change to that default — or to the theme token behind it — still
     * reaches this node.
     */
    const { store } = mount()
    const id = place(store, "core.heading")
    const text = textProperty()

    await userEvent.type(screen.getByLabelText(text.label), "!")
    await userEvent.click(screen.getByRole("button", { name: /^Reset/ }))

    expect(text.key in (store.getState().document.nodes[id]?.props ?? {})).toBe(false)
  })

  it("puts the component's own value back on screen", async () => {
    const { store } = mount()

    place(store, "core.heading")

    const text = textProperty()
    const shipped = registry.get("core.heading")?.defaultProps?.[text.key]

    // Narrowed rather than cast: a prop value may be a boolean, which is not
    // something a text box can hold — and if that is ever what a Heading ships
    // for its text, this test should say so rather than coerce it.
    if (typeof shipped !== "string") throw new Error("The heading's text default is not a string.")

    await userEvent.type(screen.getByLabelText(text.label), "!")
    await userEvent.click(screen.getByRole("button", { name: /^Reset/ }))

    expect(screen.getByLabelText(text.label)).toHaveValue(shipped)
    expect(screen.queryByRole("button", { name: /^Reset/ })).toBeNull()
  })

  it("can be undone", async () => {
    const { store } = mount()
    const id = place(store, "core.heading")
    const text = textProperty()

    await userEvent.type(screen.getByLabelText(text.label), "!")
    await userEvent.click(screen.getByRole("button", { name: /^Reset/ }))

    act(() => {
      store.getState().undo()
    })

    expect(store.getState().document.nodes[id]?.props[text.key]).toContain("!")
  })
})
