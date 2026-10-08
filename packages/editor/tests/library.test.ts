import { describe, expect, it } from "vitest"
import { RegistryBuilder, type ComponentDefinition } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { catalogOf, catalogSize, searchCatalog } from "../src/library/catalog"

/**
 * The component library, built from the registry.
 *
 * The point of these is that nothing lists components. A plugin that registers
 * one is a plugin whose component is in the panel — so the test that matters
 * most is the one where a second namespace registers something and it simply
 * appears, grouped with everything else of its kind.
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

/** A registry holding a few components across three categories. */
function registry() {
  const builder = new RegistryBuilder("core")

  builder.component(definition("core.section", "Layout", { container: true }))
  builder.component(definition("core.grid", "Layout", { container: true }))
  builder.component(definition("core.heading", "Typography"))
  builder.component(definition("core.input", "Forms"))

  return builder.build()
}

describe("the catalog", () => {
  it("is built from what the registry holds", () => {
    const groups = catalogOf(registry())

    expect(groups.map((group) => group.category)).toEqual(["Layout", "Typography", "Forms"])
    expect(catalogSize(groups)).toBe(4)
  })

  it("is in the canonical order, not registration order", () => {
    const builder = new RegistryBuilder("core")

    // Registered Forms first, which is last of the three in the canonical list.
    builder.component(definition("core.input", "Forms"))
    builder.component(definition("core.section", "Layout"))

    expect(catalogOf(builder.build()).map((group) => group.category)).toEqual(["Layout", "Forms"])
  })

  it("sorts within a group by name, which is what a person scans for", () => {
    const groups = catalogOf(registry())
    const layout = groups.find((group) => group.category === "Layout")

    // Registration order was section then grid; a user looking for "grid" does
    // not know or care which plugin loaded first.
    expect(layout?.entries.map((entry) => entry.name)).toEqual(["grid", "section"])
  })

  it("leaves out the categories nothing is in", () => {
    const groups = catalogOf(registry())

    // Eight headings with three of them filled reads as mostly broken.
    expect(groups.map((group) => group.category)).not.toContain("Checkout")
    expect(groups).toHaveLength(3)
  })

  it("carries whether a component may hold children", () => {
    const groups = catalogOf(registry())
    const layout = groups.find((group) => group.category === "Layout")

    expect(layout?.entries.find((entry) => entry.name === "section")?.container).toBe(true)

    const typography = groups.find((group) => group.category === "Typography")

    expect(typography?.entries[0]?.container).toBe(false)
  })

  it("is empty when the registry is", () => {
    const groups = catalogOf(new RegistryBuilder("core").build())

    expect(groups).toEqual([])
    expect(catalogSize(groups)).toBe(0)
  })
})

describe("a plugin's components", () => {
  it("appear by being registered, with nothing to update", () => {
    /*
     * A builder with no namespace is the host's: the constructor's own note
     * says one is passed "when given", and a plugin is given its own so it
     * cannot replace another's components. An application composes several
     * plugins, so this is the shape that path takes.
     */
    const host = new RegistryBuilder()

    host.component(definition("core.heading", "Typography"))
    host.component(definition("acme.testimonial", "Marketing"))
    host.component(definition("acme.quote", "Typography"))

    const groups = catalogOf(host.build())

    /*
     * This is the claim phases.md makes — "built from the registry (so plugins
     * appear automatically)" — and the only way to test it is to register
     * something from another namespace and find it without having named it
     * anywhere.
     */
    expect(groups.map((group) => group.category)).toEqual(["Typography", "Marketing"])
    expect(groups.find((group) => group.category === "Marketing")?.entries[0]?.type).toBe(
      "acme.testimonial",
    )

    /*
     * Grouped with their own kind rather than with their own plugin — a quote
     * is typography whoever shipped it — and ordered by the name a person
     * reads, which is "heading" before "quote" whatever the namespaces are.
     */
    expect(
      groups.find((group) => group.category === "Typography")?.entries.map((entry) => entry.type),
    ).toEqual(["core.heading", "acme.quote"])
  })
})

describe("searching", () => {
  it("matches a name", () => {
    const found = searchCatalog(catalogOf(registry()), "head")

    expect(found).toHaveLength(1)
    expect(found[0]?.entries[0]?.type).toBe("core.heading")
  })

  it("matches a type id, which is how the catalog names things", () => {
    // Somebody who has read docs/component-library.md searches `core.grid`.
    const found = searchCatalog(catalogOf(registry()), "core.grid")

    expect(found[0]?.entries.map((entry) => entry.type)).toEqual(["core.grid"])
  })

  it("ignores case and surrounding space", () => {
    expect(searchCatalog(catalogOf(registry()), "  HEADING ")[0]?.entries).toHaveLength(1)
  })

  it("returns everything for an empty query", () => {
    const groups = catalogOf(registry())

    expect(searchCatalog(groups, "")).toBe(groups)
    expect(searchCatalog(groups, "   ")).toBe(groups)
  })

  it("drops the groups that match nothing", () => {
    const found = searchCatalog(catalogOf(registry()), "grid")

    // The answer, not the answer surrounded by the question.
    expect(found).toHaveLength(1)
    expect(found[0]?.category).toBe("Layout")
  })

  it("finds nothing when nothing matches", () => {
    expect(searchCatalog(catalogOf(registry()), "nonesuch")).toEqual([])
  })
})
