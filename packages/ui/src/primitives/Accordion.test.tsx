import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel } from "./Accordion"
import { expectNoViolations } from "../../tests/axe"

function Faq(props: { defaultValue?: string } = {}) {
  return (
    <Accordion type="single" collapsible {...props}>
      <AccordionItem value="shipping">
        <AccordionHeader>Shipping</AccordionHeader>
        <AccordionPanel>Two to three days.</AccordionPanel>
      </AccordionItem>
      <AccordionItem value="returns">
        <AccordionHeader>Returns</AccordionHeader>
        <AccordionPanel>Thirty days.</AccordionPanel>
      </AccordionItem>
    </Accordion>
  )
}

describe("Accordion", () => {
  it("puts each header in a heading, so sections can be jumped between", () => {
    // Heading navigation is how a screen reader user moves through a long page
    // without reading every section.
    render(<Faq />)

    expect(screen.getAllByRole("heading")).toHaveLength(2)
    expect(screen.getByRole("heading", { name: "Shipping", level: 3 })).toBeInTheDocument()
  })

  it("takes the heading level it is given", () => {
    render(
      <Accordion type="single">
        <AccordionItem value="a">
          <AccordionHeader level={2}>Shipping</AccordionHeader>
          <AccordionPanel>Body</AccordionPanel>
        </AccordionItem>
      </Accordion>,
    )

    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument()
  })

  it("starts closed, and says so", () => {
    render(<Faq />)

    expect(screen.getByRole("button", { name: "Shipping" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    expect(screen.queryByText("Two to three days.")).not.toBeInTheDocument()
  })

  it("opens on click and reports it", async () => {
    render(<Faq />)

    await userEvent.click(screen.getByRole("button", { name: "Shipping" }))

    expect(screen.getByRole("button", { name: "Shipping" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(screen.getByText("Two to three days.")).toBeInTheDocument()
  })

  it("ties each header to the panel it controls", async () => {
    render(<Faq />)

    await userEvent.click(screen.getByRole("button", { name: "Shipping" }))

    const header = screen.getByRole("button", { name: "Shipping" })
    const panel = screen.getByRole("region")

    expect(header).toHaveAttribute("aria-controls", panel.id)
    expect(panel).toHaveAttribute("aria-labelledby", header.id)
  })

  it("closes an open section when collapsible", async () => {
    render(<Faq />)

    await userEvent.click(screen.getByRole("button", { name: "Shipping" }))
    await userEvent.click(screen.getByRole("button", { name: "Shipping" }))

    expect(screen.queryByText("Two to three days.")).not.toBeInTheDocument()
  })

  it("keeps one section open at a time when single", async () => {
    render(<Faq />)

    await userEvent.click(screen.getByRole("button", { name: "Shipping" }))
    await userEvent.click(screen.getByRole("button", { name: "Returns" }))

    expect(screen.queryByText("Two to three days.")).not.toBeInTheDocument()
    expect(screen.getByText("Thirty days.")).toBeInTheDocument()
  })

  it("opens several at once when multiple", async () => {
    render(
      <Accordion type="multiple">
        <AccordionItem value="shipping">
          <AccordionHeader>Shipping</AccordionHeader>
          <AccordionPanel>Two to three days.</AccordionPanel>
        </AccordionItem>
        <AccordionItem value="returns">
          <AccordionHeader>Returns</AccordionHeader>
          <AccordionPanel>Thirty days.</AccordionPanel>
        </AccordionItem>
      </Accordion>,
    )

    await userEvent.click(screen.getByRole("button", { name: "Shipping" }))
    await userEvent.click(screen.getByRole("button", { name: "Returns" }))

    expect(screen.getByText("Two to three days.")).toBeInTheDocument()
    expect(screen.getByText("Thirty days.")).toBeInTheDocument()
  })

  describe("keyboard", () => {
    it("opens with Enter", async () => {
      render(<Faq />)

      await userEvent.tab()
      await userEvent.keyboard("{Enter}")

      expect(screen.getByText("Two to three days.")).toBeInTheDocument()
    })

    it("moves between headers with the arrow keys", async () => {
      render(<Faq />)

      await userEvent.tab()
      await userEvent.keyboard("{ArrowDown}")

      expect(screen.getByRole("button", { name: "Returns" })).toHaveFocus()
    })
  })

  it("reports no axe violations, open or closed", async () => {
    const { container } = render(<Faq />)
    await expectNoViolations(container)

    await userEvent.click(screen.getByRole("button", { name: "Shipping" }))
    await expectNoViolations(container)
  })
})
