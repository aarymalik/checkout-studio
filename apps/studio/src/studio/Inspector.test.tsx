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
