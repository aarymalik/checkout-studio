import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ScrollArea } from "./ScrollArea"
import { expectNoViolations } from "../../tests/axe"

describe("ScrollArea", () => {
  it("shows what is inside it", () => {
    render(<ScrollArea>content</ScrollArea>)

    expect(screen.getByText("content")).toBeInTheDocument()
  })

  it("is not focusable without a name, because an unnamed stop says nothing", () => {
    render(<ScrollArea>content</ScrollArea>)

    expect(screen.queryByRole("region")).not.toBeInTheDocument()
  })

  it("becomes a named, focusable region when it is given a label", async () => {
    // A scrollable region that cannot take focus cannot be scrolled by
    // keyboard at all.
    render(<ScrollArea label="Layer list">content</ScrollArea>)

    const region = screen.getByRole("region", { name: "Layer list" })
    expect(region).toHaveAttribute("tabindex", "0")

    await userEvent.tab()
    expect(region).toHaveFocus()
  })

  it("reports no axe violations", async () => {
    const { container } = render(<ScrollArea label="Layer list">content</ScrollArea>)

    await expectNoViolations(container)
  })
})
