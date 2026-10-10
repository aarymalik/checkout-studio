import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorProvider, useEditorStoreApi, type EditorStoreApi } from "@checkout-studio/editor"
import { RegistryBuilder, type ComponentDefinition } from "@checkout-studio/plugin-sdk"
import { createDocument, type CheckoutSchema, type Node } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"
import type { ReactElement } from "react"

import { ComponentLibrary } from "./ComponentLibrary"

/**
 * The component library.
 *
 * The shipped registry is empty until Phase 9, so these register their own
 * components — which is also the honest way to test the claim the panel makes:
 * that it is built from the registry, so a plugin's components appear by being
 * registered. A test that hard-coded the list would prove the opposite.
 */

function Box(): ReactElement {
  return null as unknown as ReactElement
}

function definition(
  type: string,
  category: ComponentDefinition["category"],
  overrides: Partial<ComponentDefinition> = {},
): ComponentDefinition {
  return {
    type,
    name: type.slice(type.indexOf(".") + 1),
    category,
    interactive: false,
    container: false,
    defaultProps: {},
    defaultStyles: {},
    renderer: Box,
    ...overrides,
  }
}

/** A host registry, which is what composes several plugins' components. */
function registry() {
  const host = new RegistryBuilder()

  host.component(definition("core.section", "Layout", { container: true }))
  host.component(definition("core.heading", "Typography"))
  host.component(definition("acme.testimonial", "Marketing"))

  return host.build()
}

/** A page whose root holds one section. */
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

function mount(): { element: ReactElement; store: () => EditorStoreApi } {
  let captured: EditorStoreApi | null = null
  const built = registry()

  function Capture(): ReactElement {
    captured = useEditorStoreApi()

    return <ComponentLibrary registry={built} />
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

const countOf = (store: EditorStoreApi): number =>
  Object.keys(store.getState().document.nodes).length

describe("what it lists", () => {
  it("is whatever the registry holds, grouped by category", () => {
    render(mount().element)

    for (const group of ["Layout", "Typography", "Marketing"]) {
      expect(screen.getByRole("heading", { name: group })).toBeInTheDocument()
    }

    // A plugin's component is in the list without this file naming it anywhere
    // but the registry.
    expect(screen.getByRole("button", { name: /testimonial/ })).toBeInTheDocument()
  })

  it("leaves out the categories nothing is in", () => {
    render(mount().element)

    expect(screen.queryByRole("heading", { name: "Checkout" })).not.toBeInTheDocument()
  })

  it("does not print the type id, which was repetition on every row", () => {
    /*
     * It was there so that somebody who had read the catalog could search for
     * it. They still can — the search reads the id whether or not it is drawn
     * — so all it did was say `core.heading` beside Heading, sixteen times
     * down the panel.
     *
     * It earns its place again on the day two plugins register components
     * with the same display name, and the fix then is to show it on the pair
     * that collides.
     */
    render(mount().element)

    const entry = screen.getByRole("button", { name: /heading/ })

    expect(within(entry).queryByText("core.heading")).toBeNull()
  })
})

describe("searching", () => {
  it("narrows to what matches, and drops the empty groups", async () => {
    const user = userEvent.setup()

    render(mount().element)

    await user.type(screen.getByRole("searchbox", { name: "Search components" }), "head")

    expect(screen.getByRole("button", { name: /heading/ })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Marketing" })).not.toBeInTheDocument()
  })

  it("still finds a component by its type id, which the row no longer shows", async () => {
    /*
     * The rows used to print `core.section` beside Section, on the reasoning
     * that somebody who had read the catalog would search for it. They still
     * can — the search reads the id whether or not it is on screen — which is
     * what made printing it on all sixteen rows pure repetition.
     */
    const user = userEvent.setup()

    render(mount().element)

    await user.type(screen.getByRole("searchbox", { name: "Search components" }), "core.sec")

    expect(screen.getByRole("button", { name: "section" })).toBeInTheDocument()
  })

  it("shows a row's name and nothing else", async () => {
    render(mount().element)

    const row = screen.getByRole("button", { name: "section" })

    expect(row).toHaveTextContent(/^section$/)
  })

  it("says so when nothing matches", async () => {
    const user = userEvent.setup()

    render(mount().element)

    await user.type(screen.getByRole("searchbox", { name: "Search components" }), "nonesuch")

    expect(screen.getByText("No component has that name.")).toBeInTheDocument()
  })
})

describe("inserting", () => {
  it("is a button, so the keyboard reaches it", async () => {
    const user = userEvent.setup()
    const mounted = mount()

    render(mounted.element)

    const before = countOf(mounted.store())

    /*
     * A list you can only drag from is a list some people cannot use. The
     * keyboard path is the same path: activating an entry inserts it.
     */
    await user.click(screen.getByRole("button", { name: /heading/ }))

    expect(countOf(mounted.store())).toBe(before + 1)
  })

  it("puts it inside the selection when that can hold children", async () => {
    const user = userEvent.setup()
    const mounted = mount()

    render(mounted.element)

    mounted.store().getState().select(["section"])

    await user.click(screen.getByRole("button", { name: /heading/ }))

    expect(mounted.store().getState().document.nodes["section"]?.children).toHaveLength(1)
  })

  it("puts it beside the selection when that cannot", async () => {
    const user = userEvent.setup()
    const mounted = mount()

    render(mounted.element)

    // A heading inside the section, which takes no children itself.
    await user.click(screen.getByRole("button", { name: /heading/ }))

    const inserted = mounted.store().getState().selection.ids[0] as string

    await user.click(screen.getByRole("button", { name: /testimonial/ }))

    const root = mounted.store().getState().document.root
    const siblings = mounted.store().getState().document.nodes[root]?.children ?? []

    // Beside it, not inside: the next position among its own siblings.
    expect(mounted.store().getState().document.nodes[inserted]?.children).toHaveLength(0)
    expect(siblings.length).toBeGreaterThan(1)
  })

  it("puts it at the end of the page when nothing is selected", async () => {
    const user = userEvent.setup()
    const mounted = mount()

    render(mounted.element)

    mounted.store().getState().clearSelection()

    await user.click(screen.getByRole("button", { name: /section/ }))

    const root = mounted.store().getState().document.root

    expect(mounted.store().getState().document.nodes[root]?.children).toHaveLength(2)
  })
})

describe("a session that may only read", () => {
  it("offers nothing to press", () => {
    const mounted = mount()

    render(mounted.element)

    // Inside `act`, or the store write lands and React never re-renders —
    // which looks exactly like the panel ignoring the session.
    act(() => mounted.store().getState().setCanEdit(false))

    for (const name of [/heading/, /section/]) {
      expect(screen.getByRole("button", { name })).toBeDisabled()
    }
  })
})

describe("an empty registry", () => {
  it("says what will be there rather than showing nothing", () => {
    function Capture(): ReactElement {
      return <ComponentLibrary registry={new RegistryBuilder().build()} />
    }

    render(
      <EditorProvider document={page()} baseVersion={1}>
        <Capture />
      </EditorProvider>,
    )

    expect(screen.getByText("Nothing to add yet")).toBeInTheDocument()
    // And names the mechanism, because "plugins add theirs by registering them"
    // is the thing a plugin author needs to know.
    expect(screen.getByText(/by being registered/)).toBeInTheDocument()
  })
})
