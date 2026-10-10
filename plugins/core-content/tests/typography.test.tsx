import { describe, expect, it } from "vitest"
import { within } from "@testing-library/react"
import { PluginHost } from "@checkout-studio/plugin-sdk"
import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION } from "@checkout-studio/schema"

import { coreContent } from "../src/renderer"
import { coreContentProperties } from "../src/editor"
import { badge } from "../src/components/badge/definition"
import { heading } from "../src/components/heading/definition"
import { HEADING_LEVELS, levelOf } from "../src/components/heading/Renderer"
import { text } from "../src/components/text/definition"
import { textGradientStyle } from "../src/components/gradient"
import { nodeOf, renderComponent } from "./support"

/**
 * Heading, Text and Badge.
 *
 * The first components in this product with words in them, so most of what is
 * worth asserting is about the words: where they come from, what element holds
 * them, and what happens when there are none.
 */

const registry = new PluginHost({
  versions: { engine: "0.1.0", schema: CURRENT_VERSION },
})
  .register(coreContent)
  .startSync()

function definitions(): readonly ComponentDefinition[] {
  return registry
    .types()
    .map((type) => registry.get(type))
    .filter((definition): definition is ComponentDefinition => definition !== undefined)
}

describe("what every component in this plugin holds to", () => {
  it("ships no JavaScript to a published page", () => {
    expect(definitions().every((definition) => !definition.interactive)).toBe(true)
  })

  it("holds no children, because text is not a container", () => {
    expect(definitions().every((definition) => !definition.container)).toBe(true)
  })

  it("is filed under the category the catalog gives it", () => {
    // Not all Typography any more: Image, Video and Icon are Media. The
    // catalog is the source of which is which.
    const byType = new Map(
      definitions().map((definition) => [definition.type, definition.category]),
    )

    expect(byType.get("core.heading")).toBe("Typography")
    expect(byType.get("core.text")).toBe("Typography")
    expect(byType.get("core.badge")).toBe("Typography")
    expect(byType.get("core.image")).toBe("Media")
    expect(byType.get("core.video")).toBe("Media")
    expect(byType.get("core.icon")).toBe("Media")
  })

  it("has property definitions, and they parse", () => {
    for (const definition of definitions()) {
      expect(coreContentProperties.get(definition.type)?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it("takes its type and colour from theme tokens rather than from literals", () => {
    const token = (value: unknown) =>
      typeof value === "string" && value.startsWith("{") && value.endsWith("}")

    for (const definition of definitions()) {
      for (const key of ["fontFamily", "fontSize", "color"]) {
        const value = definition.defaultStyles[key]

        if (value === undefined) continue

        expect(token(value), `${definition.type} ${key} = ${String(value)}`).toBe(true)
      }
    }
  })

  it("reads a bound number as text, because a price is one", () => {
    // Props arrive resolved, so a `$var` bound to a quantity is a number by the
    // time a component sees it. Refusing it would render nothing with no error.
    //
    // The three that hold words. An image has no text to bind.
    for (const definition of definitions().filter((entry) => entry.category === "Typography")) {
      const { container } = renderComponent(definition, { props: { text: 42 } })

      // Scoped to this render. `cleanup` runs between tests, not inside one, so
      // three renders in a loop share the document.
      expect(within(container).getByText("42")).toBeInTheDocument()
    }
  })
})

describe("Heading", () => {
  it("renders the element its level names", () => {
    for (const level of HEADING_LEVELS) {
      const { container } = renderComponent(heading, { props: { text: "Title", level } })

      expect(container.querySelector(`h${level}`)).not.toBeNull()
    }
  })

  it("is a heading in the accessibility tree, at the level it claims", () => {
    const { container } = renderComponent(heading, { props: { text: "Pay now", level: 3 } })

    expect(
      within(container).getByRole("heading", { level: 3, name: "Pay now" }),
    ).toBeInTheDocument()
  })

  it("falls back to a real level when the document holds something that is not one", () => {
    /*
     * A document can hold anything a previous version wrote or a careless
     * import produced. `h7` is not an element: React renders an unknown tag,
     * the browser treats it as an inline span, and the heading is visibly a
     * heading and structurally not — present on screen, absent from the
     * outline a screen reader navigates by.
     */
    expect(levelOf(7)).toBe(2)
    expect(levelOf("2")).toBe(2)
    expect(levelOf(undefined)).toBe(2)

    const { container } = renderComponent(heading, { props: { text: "Title", level: 7 } })

    expect(container.querySelector("h2")).not.toBeNull()
    expect(container.querySelector("h7")).toBeNull()
  })

  it("defaults to level 2, so four inserted headings are not four titles", () => {
    expect(heading.defaultProps["level"]).toBe(2)
  })

  it("refuses to be empty", () => {
    // An empty heading takes a line, is announced as a heading, and says
    // nothing — which is worse than one that is visibly missing.
    expect(heading.validate?.(nodeOf("core.heading", { props: { text: "" } }), {} as never)).toBe(
      "This heading has no text.",
    )
    expect(
      heading.validate?.(nodeOf("core.heading", { props: { text: "   " } }), {} as never),
    ).toBe("This heading has no text.")
    expect(
      heading.validate?.(nodeOf("core.heading", { props: { text: "Title" } }), {} as never),
    ).toBeNull()
  })

  it("keeps size and level separate, so looking small is not a demotion", () => {
    const keys = coreContentProperties.get("core.heading")?.map((property) => property.key) ?? []

    expect(keys).toContain("level")
    expect(keys).toContain("fontSize")
  })
})

describe("the heading gradient", () => {
  it("paints the text rather than the box behind it", () => {
    const { container } = renderComponent(heading, {
      props: { text: "Title", gradient: "linear-gradient(90deg, #4f46e5, #06b6d4)" },
    })
    const style = container.querySelector("h2")?.getAttribute("style") ?? ""

    // Three declarations, because there is no one CSS property for this: paint
    // a background, clip it to the glyphs, and make the text transparent.
    expect(style).toContain("background-image")
    expect(style).toContain("background-clip: text")
    expect(style).toContain("color: transparent")
  })

  it("emits the prefixed clip too, which Safari still needs", () => {
    /*
     * Asserted on what the component produces rather than on the rendered
     * style attribute: jsdom drops `-webkit-background-clip`, so a test
     * reading it back would be testing jsdom's CSS support. A heading rendered
     * as a solid block of colour because the prefix was missing is unreadable
     * rather than unstyled, and Safari is the browser that needs it.
     */
    expect(textGradientStyle("linear-gradient(90deg, red, blue)")).toMatchObject({
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    })
  })

  it("refuses a value that could close the declaration and open another", () => {
    const { container } = renderComponent(heading, {
      props: { text: "Title", gradient: "red;position:fixed;inset:0" },
    })

    expect(container.querySelector("h2")?.getAttribute("style")).toBeNull()
  })

  it("draws nothing when there is no gradient", () => {
    const { container } = renderComponent(heading, { props: { text: "Title" } })

    expect(container.querySelector("h2")?.getAttribute("style")).toBeNull()
  })
})

describe("Text", () => {
  it("is a paragraph", () => {
    const { container } = renderComponent(text, { props: { text: "Secure checkout." } })

    expect(container.querySelector("p")?.textContent).toBe("Secure checkout.")
  })

  it("keeps a line break somebody typed", () => {
    /*
     * Without `pre-wrap` a paragraph written over three lines renders as one,
     * and there is nothing on screen to explain it.
     */
    expect(text.defaultStyles["whiteSpace"]).toBe("pre-wrap")
  })

  it("is allowed to be empty, unlike a heading", () => {
    // An empty paragraph is invisible and announces nothing, so it costs a user
    // nothing while they work. Blocking a publish on it would be the editor
    // refusing to save a page somebody is halfway through.
    expect(text.validate).toBeUndefined()
  })

  it("has no level, because a paragraph has no place in the outline", () => {
    const keys = coreContentProperties.get("core.text")?.map((property) => property.key) ?? []

    expect(keys).not.toContain("level")
  })
})

describe("Badge", () => {
  it("is a span, so it does not take a line to itself", () => {
    const { container } = renderComponent(badge, { props: { text: "New" } })

    expect(container.querySelector("span")?.textContent).toBe("New")
  })

  it("uses the one colour pair a theme guarantees is readable", () => {
    /*
     * `primaryForeground` exists to be legible on `primary`. A badge that
     * picked `foreground` on `primary` would be dark grey on indigo, and
     * whether that was readable would depend on the brand.
     */
    expect(badge.defaultStyles["backgroundColor"]).toBe("{colors.primary}")
    expect(badge.defaultStyles["color"]).toBe("{colors.primaryForeground}")
  })

  it("does not stretch to fill a flex parent", () => {
    // A badge sits beside things. Every layout container in this product is a
    // flex column, where the default is to stretch.
    expect(badge.defaultStyles["alignSelf"]).toBe("flex-start")
  })
})
