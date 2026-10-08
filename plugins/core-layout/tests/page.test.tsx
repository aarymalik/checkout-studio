import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"

import { page } from "../src/components/page/definition"
import { renderComponent } from "./support"

/**
 * The page root.
 *
 * `core.page` is `ROOT_TYPE` in packages/schema, so this is the one component
 * every document in the product contains. Before it existed every page —
 * canvas and published alike — resolved its root to the unsupported fallback.
 */

describe("the element it renders", () => {
  it("is the main landmark on a page we own", () => {
    renderComponent(page, { mode: "published" })

    expect(screen.getByRole("main")).toBeInTheDocument()
  })

  it("is the main landmark when rendered statically too", () => {
    renderComponent(page, { mode: "static" })

    expect(screen.getByRole("main")).toBeInTheDocument()
  })

  it("is a plain div in the editor, where a main already exists", () => {
    /*
     * The studio shell puts a `<main aria-label="Canvas">` around the canvas.
     * A second main inside it is an axe violation and, worse, a screen reader
     * user being told there are two places the content might be.
     */
    const { container } = renderComponent(page, { mode: "editor-preview" })

    expect(screen.queryByRole("main")).toBeNull()
    expect(container.firstElementChild?.tagName).toBe("DIV")
  })

  it("is a plain div when embedded in somebody else's page", () => {
    // We do not know what landmarks the host page already has.
    const { container } = renderComponent(page, { mode: "embed" })

    expect(screen.queryByRole("main")).toBeNull()
    expect(container.firstElementChild?.tagName).toBe("DIV")
  })

  it("renders its children in every mode", () => {
    renderComponent(page, { mode: "editor-preview", children: <p>content</p> })

    expect(screen.getByText("content")).toBeInTheDocument()
  })
})

describe("its registration", () => {
  it("is not something a user can insert", () => {
    // Otherwise the library panel lists Page under Layout as something to drag
    // onto the page it is already inside.
    expect(page.insertable).toBe(false)
  })

  it("holds children, because everything on a page is inside it", () => {
    expect(page.container).toBe(true)
  })

  it("takes its colours from the theme rather than from a literal", () => {
    expect(page.defaultStyles["backgroundColor"]).toBe("{colors.background}")
    expect(page.defaultStyles["color"]).toBe("{colors.foreground}")
  })

  it("is the type the schema actually creates", () => {
    // If these ever diverge, every document's root silently becomes an
    // unsupported node again and nothing else reports it.
    expect(page.type).toBe("core.page")
  })
})
