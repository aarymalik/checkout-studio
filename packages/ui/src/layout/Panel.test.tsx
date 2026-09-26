import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../primitives/Button"
import { Panel } from "./Panel"
import { expectNoViolations } from "../../tests/axe"

describe("Panel", () => {
  it("is a region named by its title, so it can be jumped to", () => {
    // This is what lets a screen reader user go straight to "Layers" instead of
    // walking the whole document to find it.
    render(<Panel title="Layers">content</Panel>)

    expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument()
  })

  it("puts its title in a heading", () => {
    render(<Panel title="Layers">content</Panel>)

    expect(screen.getByRole("heading", { name: "Layers" })).toBeInTheDocument()
  })

  it("keeps the title announced when it is hidden", () => {
    render(
      <Panel title="Layers" titleHidden>
        content
      </Panel>,
    )

    expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument()
  })

  it("shows header actions", () => {
    render(
      <Panel title="Layers" actions={<Button size="sm">Add</Button>}>
        content
      </Panel>,
    )

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument()
  })

  describe("collapsing", () => {
    it("offers no collapse control unless it can collapse", () => {
      render(<Panel title="Layers">content</Panel>)

      expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })

    it("says whether it is open", () => {
      render(
        <Panel title="Layers" onCollapsedChange={vi.fn()}>
          content
        </Panel>,
      )

      expect(screen.getByRole("button", { name: "Collapse Layers" })).toHaveAttribute(
        "aria-expanded",
        "true",
      )
    })

    it("collapses and expands", async () => {
      function Collapsible() {
        const [collapsed, setCollapsed] = useState(false)
        return (
          <Panel title="Layers" collapsed={collapsed} onCollapsedChange={setCollapsed}>
            content
          </Panel>
        )
      }

      render(<Collapsible />)

      await userEvent.click(screen.getByRole("button", { name: "Collapse Layers" }))
      expect(screen.queryByText("content")).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole("button", { name: "Expand Layers" }))
      expect(screen.getByText("content")).toBeInTheDocument()
    })

    it("stays findable by its title while collapsed", () => {
      // A rail with no accessible name is a region nobody can navigate back to.
      render(
        <Panel title="Layers" collapsed onCollapsedChange={vi.fn()}>
          content
        </Panel>,
      )

      expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument()
    })

    it("hides its actions while collapsed, where there is no room for them", () => {
      render(
        <Panel title="Layers" collapsed onCollapsedChange={vi.fn()} actions={<Button>Add</Button>}>
          content
        </Panel>,
      )

      expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument()
    })
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <Panel title="Layers" onCollapsedChange={vi.fn()} actions={<Button size="sm">Add</Button>}>
        content
      </Panel>,
    )

    await expectNoViolations(container)
  })
})
