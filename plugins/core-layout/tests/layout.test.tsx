import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import { PluginHost } from "@checkout-studio/plugin-sdk"
import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION } from "@checkout-studio/schema"

import { coreLayout } from "../src/renderer"
import { coreLayoutProperties } from "../src/editor"
import { columns } from "../src/components/columns/definition"
import { container } from "../src/components/container/definition"
import { divider } from "../src/components/divider/definition"
import { grid, columnTracks } from "../src/components/grid/definition"
import { spacer } from "../src/components/spacer/definition"
import { stack } from "../src/components/stack/definition"
import { renderComponent } from "./support"

/**
 * The layout components.
 *
 * Section and the page have files of their own; these are the six that
 * followed the pattern, and most of what is worth asserting about them is
 * shared — so most of this is driven from the registry. What is specific is
 * what each one decided, and those are the tests with reasons attached.
 */

const registry = new PluginHost({
  versions: { engine: "0.1.0", schema: CURRENT_VERSION },
})
  .register(coreLayout)
  .startSync()

function definitions(): readonly ComponentDefinition[] {
  return registry
    .types()
    .map((type) => registry.get(type))
    .filter((definition): definition is ComponentDefinition => definition !== undefined)
}

describe("what every component in this plugin holds to", () => {
  it("ships no JavaScript to a published page", () => {
    // The published bundle budget is the reason. A layout component that
    // hydrated would put React on a checkout to arrange boxes CSS arranged
    // already.
    expect(definitions().every((definition) => !definition.interactive)).toBe(true)
  })

  it("is filed under Layout", () => {
    expect(definitions().every((definition) => definition.category === "Layout")).toBe(true)
  })

  it("takes the class the renderer resolved its styles into", () => {
    for (const definition of definitions()) {
      const { container: host } = renderComponent(definition)

      expect(host.firstElementChild).toHaveClass("ck-test")
    }
  })

  it("has property definitions, and they parse", () => {
    // `defineProperties` parses at module scope, so importing the editor half
    // at all is the assertion. This is the test that every component was given
    // one rather than forgotten.
    for (const definition of definitions()) {
      expect(coreLayoutProperties.get(definition.type)?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it("takes its colours and spacing from theme tokens, not from literals", () => {
    /*
     * A literal is a number that outlives the decision that produced it. The
     * exceptions are the ones with no token to reference: `100%`, `auto`, `0`,
     * a flex keyword, and the divider's 1px hairline — the spacing scale's
     * smallest step is 4.
     */
    const referencesAToken = (value: unknown) =>
      typeof value === "string" && value.startsWith("{") && value.endsWith("}")

    for (const definition of definitions()) {
      for (const [key, value] of Object.entries(definition.defaultStyles)) {
        if (!/^(padding|margin|gap|color|backgroundColor|borderTopColor)/i.test(key)) continue
        if (value === "auto" || value === "0") continue

        expect(referencesAToken(value), `${definition.type} ${key} = ${String(value)}`).toBe(true)
      }
    }
  })
})

describe("Container", () => {
  it("centres itself rather than relying on its parent", () => {
    // A container that only centres inside a flex parent moves when somebody
    // changes the parent.
    expect(container.defaultStyles["marginLeft"]).toBe("auto")
    expect(container.defaultStyles["marginRight"]).toBe("auto")
  })

  it("puts its maximum width in the theme, where one edit moves every page", () => {
    /*
     * The first real use of `themeSlot` — stage 1 of the cascade. 1120px here
     * and 960px on the next page is not a choice anybody made.
     */
    expect(container.themeSlot?.toStyles?.({ maxWidth: "960px" }, {} as never)).toEqual({
      maxWidth: "960px",
    })
  })

  it("refuses a theme that sets the slot to nonsense", () => {
    expect(() => container.themeSlot?.schema.parse({ maxWidth: "" })).toThrow()
  })

  it("falls back to its own default in a theme that has never heard of it", () => {
    // Which is every theme today: `theme.components` ships empty.
    expect(container.themeSlot?.defaults).toEqual({ maxWidth: "1120px" })
  })
})

describe("Grid and Columns", () => {
  it("floors their columns at zero, which is the bug real data finds", () => {
    /*
     * A bare `1fr` floors at the content's minimum size, so one long unbroken
     * string — an order id, a URL — makes its column wider than its share and
     * pushes the rest off the page.
     */
    expect(columnTracks(3)).toBe("repeat(3, minmax(0, 1fr))")
    expect(grid.defaultStyles["gridTemplateColumns"]).toBe("repeat(2, minmax(0, 1fr))")
    expect(columns.defaultStyles["gridTemplateColumns"]).toBe("repeat(2, minmax(0, 1fr))")
  })

  it("makes the column count responsive, which is what collapsing is", () => {
    // The catalog lists "Responsive Collapse" as an editable on Columns. It is
    // not a control: setting the count to 1 at the mobile breakpoint is the
    // whole feature, and a second switch would be a second way to say it.
    const count = coreLayoutProperties
      .get("core.columns")
      ?.find((property) => property.key === "gridTemplateColumns")

    expect(count?.responsive).toBe(true)
    expect(count?.control).toBe("columns")
  })
})

describe("Stack", () => {
  it("is a column by default, because a checkout is one", () => {
    expect(stack.defaultStyles["flexDirection"]).toBe("column")
  })

  it("offers direction per breakpoint, so a row becomes a column on a phone", () => {
    const direction = coreLayoutProperties
      .get("core.stack")
      ?.find((property) => property.key === "flexDirection")

    expect(direction?.responsive).toBe(true)
  })
})

describe("Spacer", () => {
  it("has nothing to announce, and says so", () => {
    // A screen reader reading "group" for every gap between two sections is a
    // page that takes three times as long to listen to and says no more.
    const { container: host } = renderComponent(spacer)

    expect(host.firstElementChild).toHaveAttribute("aria-hidden", "true")
  })

  it("refuses to shrink, which is the reason it is not a div with a height", () => {
    /*
     * Inside a flex column — Section, Container and Stack all are one — a child
     * with a height and no shrink rule is the first thing the browser squeezes.
     * A spacer that silently becomes 4px tall is worse than no spacer, because
     * the page then looks wrong somewhere else.
     */
    expect(spacer.defaultStyles["flexShrink"]).toBe(0)
  })

  it("holds no children, and renders none it is handed", () => {
    const { container: host } = renderComponent(spacer, { children: <p>content</p> })

    expect(spacer.container).toBe(false)
    expect(screen.queryByText("content")).toBeNull()
    expect(host.firstElementChild?.childNodes).toHaveLength(0)
  })
})

describe("Divider", () => {
  it("is an hr, so somebody listening hears the break too", () => {
    const { container: host } = renderComponent(divider)

    expect(host.querySelector("hr")).not.toBeNull()
    expect(screen.getByRole("separator")).toBeInTheDocument()
  })

  it("resets the browser's own border before drawing its own", () => {
    /*
     * An `<hr>` arrives with a 2px inset border on all four sides. Without the
     * reset, a Thickness setting lands on top of the groove and the line is
     * 3px of two colours.
     */
    expect(divider.defaultStyles["borderStyle"]).toBe("none")
    expect(divider.defaultStyles["borderTopStyle"]).toBe("solid")
  })

  it("draws one edge, because a divider that drew four would be a box", () => {
    const edges = Object.keys(divider.defaultStyles).filter((key) =>
      /^border(Right|Bottom|Left)/.test(key),
    )

    expect(edges).toEqual([])
  })

  it("holds no children", () => {
    expect(divider.container).toBe(false)
  })
})
