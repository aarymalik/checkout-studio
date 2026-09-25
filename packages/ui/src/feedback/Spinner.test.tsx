import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Spinner } from "./Spinner"
import { expectNoViolations } from "../../tests/axe"

describe("Spinner", () => {
  it("announces that work is happening", () => {
    render(<Spinner />)

    expect(screen.getByRole("status")).toHaveTextContent("Loading")
  })

  it("can say what is being waited for", () => {
    render(<Spinner label="Publishing" />)

    expect(screen.getByRole("status")).toHaveTextContent("Publishing")
  })

  it("hides the graphic from assistive technology, since the text carries it", () => {
    const { container } = render(<Spinner />)

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it.each([
    ["sm", "size-3"],
    ["md", "size-4"],
    ["lg", "size-5"],
  ] as const)("renders %s at %s", (size, expected) => {
    const { container } = render(<Spinner size={size} />)

    // An SVG's className is an SVGAnimatedString, not a string: reading it as
    // one gives an object that matches nothing and asserts nothing.
    expect(container.querySelector("svg")?.getAttribute("class")).toContain(expected)
  })

  it("keeps turning when the reader asks for reduced motion", () => {
    // A frozen spinner says nothing at all. reset.css exempts essential motion
    // from the blanket reduced-motion rule, and this is the marker it selects on
    // — deleting it would silently stop the only signal of progress.
    const { container } = render(<Spinner />)

    expect(container.querySelector("svg")).toHaveAttribute("data-essential-motion")
  })

  it("reports no axe violations", async () => {
    const { container } = render(<Spinner />)

    await expectNoViolations(container)
  })
})
