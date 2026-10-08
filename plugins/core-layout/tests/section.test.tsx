import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"

import { section } from "../src/components/section/definition"
import { sectionProperties } from "../src/components/section/properties"
import { renderComponent } from "./support"

/**
 * Section, the reference component.
 *
 * The tests docs/phases.md Phase 9 asks for of every component: it renders with
 * defaults, the semantic element is right, it takes children where documented,
 * it survives zero and many, and each documented editable property is
 * accounted for.
 */

describe("what it renders", () => {
  it("is a section element, which is what carries the meaning", () => {
    const { container } = renderComponent(section)

    expect(container.querySelector("section")).not.toBeNull()
  })

  it("takes the class the renderer resolved its styles into", () => {
    // Every resolved style is in a class, which is what keeps pan and zoom free
    // of per-node work. A component that styled itself inline would defeat it.
    const { container } = renderComponent(section)

    expect(container.querySelector("section")).toHaveClass("ck-test")
  })

  it("renders its children, in order", () => {
    renderComponent(section, {
      children: (
        <>
          <p>first</p>
          <p>second</p>
        </>
      ),
    })

    expect(screen.getByText("first")).toBeInTheDocument()
    expect(screen.getByText("second")).toBeInTheDocument()
  })

  it("renders with no children at all", () => {
    const { container } = renderComponent(section)

    expect(container.querySelector("section")?.childNodes).toHaveLength(0)
  })

  it("renders a hundred children without special-casing any of them", () => {
    const many = Array.from({ length: 100 }, (_, index) => <p key={index}>{`child ${index}`}</p>)

    renderComponent(section, { children: many })

    expect(screen.getByText("child 99")).toBeInTheDocument()
  })

  it("stays a generic container rather than an unnamed landmark", () => {
    /*
     * A `<section>` becomes a region only once it has an accessible name. Six
     * unnamed regions on a page is worse to navigate than none — a screen
     * reader reads "region" six times and tells the user nothing.
     */
    const { container } = renderComponent(section)

    expect(container.querySelector("section")).not.toHaveAttribute("aria-label")
    expect(screen.queryByRole("region")).toBeNull()
  })
})

describe("the background image, which is a prop because it has to be", () => {
  it("becomes a CSS background when the asset resolved", () => {
    const { container } = renderComponent(section, {
      props: { backgroundImage: { src: "https://cdn.example.com/hero.jpg" } },
    })

    expect(container.querySelector("section")).toHaveStyle({
      backgroundImage: 'url("https://cdn.example.com/hero.jpg")',
    })
  })

  it("renders no declaration at all when there is no image", () => {
    const { container } = renderComponent(section)

    expect(container.querySelector("section")?.getAttribute("style")).toBeNull()
  })

  it("refuses a src that could close the declaration and open another", () => {
    /*
     * A URL is interpolated into `url("…")`, so a src carrying a quote and a
     * paren is CSS injection. The check is the schema's own `isSafeCssValue`,
     * and a value that fails it produces nothing rather than a sanitised guess
     * — on a payments page, a background that silently does not appear is a
     * far better outcome than one that brought a declaration with it.
     */
    const { container } = renderComponent(section, {
      props: { backgroundImage: { src: '");background:url(//evil.example/x' } },
    })

    expect(container.querySelector("section")?.getAttribute("style")).toBeNull()
  })
})

describe("an empty container in the editor", () => {
  it("has height, so there is something to drop into", () => {
    const { container } = renderComponent(section, { mode: "editor-preview" })

    expect(container.querySelector("section")).toHaveStyle({ minHeight: "64px" })
  })

  it("has none on a published page, where empty should take no space", () => {
    const { container } = renderComponent(section, { mode: "published" })

    expect(container.querySelector("section")?.getAttribute("style")).toBeNull()
  })

  it("has none once it holds something", () => {
    const { container } = renderComponent(section, {
      mode: "editor-preview",
      node: { children: ["nod_child"] },
      children: <p>content</p>,
    })

    expect(container.querySelector("section")?.getAttribute("style")).toBeNull()
  })
})

describe("its registration", () => {
  it("holds children and ships no JavaScript", () => {
    expect(section.container).toBe(true)
    expect(section.interactive).toBe(false)
  })

  it("is filed under the category the catalog gives it", () => {
    expect(section.category).toBe("Layout")
  })

  it("defaults its spacing to theme tokens rather than to numbers", () => {
    /*
     * `{spacing.9}` compiles to `var(--ck-space-9)`, so a theme that changes
     * its scale moves every section on every page without a document being
     * rewritten. A literal would be a number outliving the decision that made
     * it.
     */
    expect(section.defaultStyles["paddingTop"]).toBe("{spacing.9}")
  })
})

describe("its property definitions", () => {
  it("covers everything the catalog calls editable", () => {
    // docs/component-library.md § Section. A property missing here is a
    // component the inspector cannot fully edit, and nothing else would say so.
    const keys = new Set(sectionProperties.map((property) => property.key))

    expect([
      "width",
      "maxWidth",
      "backgroundColor",
      "padding",
      "margin",
      "border",
      "borderRadius",
      "boxShadow",
      "overflow",
    ]).toSatisfy((expected: string[]) => expected.every((key) => keys.has(key)))
  })

  it("makes every style responsive, which is how 'Supports: Responsive' is kept", () => {
    const styles = sectionProperties.filter((property) => property.target === "style")

    expect(styles.every((property) => property.responsive)).toBe(true)
  })

  it("keeps the background image a prop, and so not responsive", () => {
    const image = sectionProperties.find((property) => property.key === "backgroundImage")

    // Not a choice: a style value is a string, a number, a boolean or null, and
    // an asset reference is an object.
    expect(image?.target).toBe("prop")
    expect(image?.responsive).toBe(false)
  })
})
