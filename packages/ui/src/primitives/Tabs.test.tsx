import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "./Tabs"
import { expectNoViolations } from "../../tests/axe"

function Settings(props: Partial<Parameters<typeof Tabs>[0]> = {}) {
  return (
    <Tabs defaultValue="general" {...props}>
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="danger" disabled>
          Danger
        </TabsTrigger>
      </TabsList>
      <TabsPanel value="general">General settings</TabsPanel>
      <TabsPanel value="payments">Payment settings</TabsPanel>
      <TabsPanel value="danger">Danger zone</TabsPanel>
    </Tabs>
  )
}

describe("Tabs", () => {
  it("is a tablist of tabs with one panel", () => {
    render(<Settings />)

    expect(screen.getByRole("tablist")).toBeInTheDocument()
    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1)
  })

  it("shows the panel for the selected tab and nothing else", () => {
    render(<Settings />)

    expect(screen.getByRole("tabpanel")).toHaveTextContent("General settings")
    expect(screen.queryByText("Payment settings")).not.toBeInTheDocument()
  })

  it("says which tab is selected", () => {
    render(<Settings />)

    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Payments" })).toHaveAttribute("aria-selected", "false")
  })

  it("ties each tab to the panel it controls", () => {
    render(<Settings />)

    const tab = screen.getByRole("tab", { name: "General" })
    const panel = screen.getByRole("tabpanel")

    expect(tab).toHaveAttribute("aria-controls", panel.id)
    expect(panel).toHaveAttribute("aria-labelledby", tab.id)
  })

  it("switches panel on click", async () => {
    render(<Settings />)

    await userEvent.click(screen.getByRole("tab", { name: "Payments" }))

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Payment settings")
  })

  it("marks the active tab with more than colour", () => {
    // An underline and a heavier weight survive a colour-blind reader and a
    // greyscale print; a blue label does not.
    render(<Settings />)

    const className = screen.getByRole("tab", { name: "General" }).className
    expect(className).toContain("data-[state=active]:border-b-2")
    expect(className).toContain("data-[state=active]:font-medium")
  })

  describe("keyboard", () => {
    it("takes one Tab stop for the list, then the panel", async () => {
      // Tabbing through every tab in turn is what a row of buttons gives you,
      // and it makes a panelled interface unusable.
      render(<Settings />)

      await userEvent.tab()
      expect(screen.getByRole("tab", { name: "General" })).toHaveFocus()

      await userEvent.tab()
      expect(screen.getByRole("tabpanel")).toHaveFocus()
    })

    it("moves between tabs with the arrow keys", async () => {
      render(<Settings />)

      await userEvent.tab()
      await userEvent.keyboard("{ArrowRight}")

      expect(screen.getByRole("tab", { name: "Payments" })).toHaveFocus()
    })

    it("skips a disabled tab", async () => {
      render(<Settings />)

      await userEvent.tab()
      await userEvent.keyboard("{ArrowRight}{ArrowRight}")

      expect(screen.getByRole("tab", { name: "General" })).toHaveFocus()
    })

    it("jumps to the first and last with Home and End", async () => {
      render(<Settings />)

      await userEvent.tab()
      await userEvent.keyboard("{End}")
      expect(screen.getByRole("tab", { name: "Payments" })).toHaveFocus()

      await userEvent.keyboard("{Home}")
      expect(screen.getByRole("tab", { name: "General" })).toHaveFocus()
    })
  })

  it("does not select a disabled tab", async () => {
    render(<Settings />)

    await userEvent.click(screen.getByRole("tab", { name: "Danger" }))

    expect(screen.getByRole("tabpanel")).toHaveTextContent("General settings")
  })

  describe("controlled", () => {
    it("shows the panel its owner chose", async () => {
      function Controlled() {
        const [value, setValue] = useState("general")
        return (
          <>
            <Settings value={value} onValueChange={setValue} />
            <button onClick={() => setValue("payments")}>Go to payments</button>
          </>
        )
      }

      render(<Controlled />)

      await userEvent.click(screen.getByRole("button", { name: "Go to payments" }))

      expect(screen.getByRole("tabpanel")).toHaveTextContent("Payment settings")
    })

    it("reports each change", async () => {
      const onValueChange = vi.fn()
      render(<Settings onValueChange={onValueChange} />)

      await userEvent.click(screen.getByRole("tab", { name: "Payments" }))

      expect(onValueChange).toHaveBeenCalledWith("payments")
    })
  })

  it("reports no axe violations", async () => {
    const { container } = render(<Settings />)

    await expectNoViolations(container)
  })
})
