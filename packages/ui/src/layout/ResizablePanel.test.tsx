import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ResizablePanel } from "./ResizablePanel"
import { expectNoViolations } from "../../tests/axe"

describe("ResizablePanel", () => {
  it("is a panel with a divider beside it", () => {
    render(<ResizablePanel title="Layers">content</ResizablePanel>)

    expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument()
    expect(screen.getByRole("separator", { name: "Resize Layers" })).toBeInTheDocument()
  })

  it("starts at its default width", () => {
    render(
      <ResizablePanel title="Layers" defaultWidth={300}>
        content
      </ResizablePanel>,
    )

    expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "300")
  })

  it("resizes itself when nobody else owns the width", async () => {
    render(
      <ResizablePanel title="Layers" defaultWidth={300}>
        content
      </ResizablePanel>,
    )

    await userEvent.tab()
    await userEvent.keyboard("{ArrowRight}")

    expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "316")
  })

  it("reports a resize, so the width can be persisted", async () => {
    // docs/design-system.md asks for panel width to persist, and a component
    // cannot persist anything the application does not know about.
    const onWidthChange = vi.fn()
    render(
      <ResizablePanel title="Layers" defaultWidth={300} onWidthChange={onWidthChange}>
        content
      </ResizablePanel>,
    )

    await userEvent.tab()
    await userEvent.keyboard("{ArrowRight}")

    expect(onWidthChange).toHaveBeenCalledWith(316)
  })

  it("obeys the width it is given rather than its own", async () => {
    function Fixed() {
      const [width] = useState(280)
      return (
        <ResizablePanel title="Layers" width={width} onWidthChange={vi.fn()}>
          content
        </ResizablePanel>
      )
    }

    render(<Fixed />)

    await userEvent.tab()
    await userEvent.keyboard("{ArrowRight}")

    expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "280")
  })

  it("keeps the reader inside the range it was given", async () => {
    render(
      <ResizablePanel title="Layers" defaultWidth={300} minWidth={280} maxWidth={320}>
        content
      </ResizablePanel>,
    )

    await userEvent.tab()
    await userEvent.keyboard("{End}")

    expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "320")
  })

  it("narrows to a rail when collapsed", async () => {
    function Collapsible() {
      const [collapsed, setCollapsed] = useState(false)
      return (
        <ResizablePanel title="Layers" collapsed={collapsed} onCollapsedChange={setCollapsed}>
          content
        </ResizablePanel>
      )
    }

    render(<Collapsible />)

    await userEvent.click(screen.getByRole("button", { name: "Collapse Layers" }))

    expect(screen.queryByText("content")).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument()
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <ResizablePanel title="Layers" side="end" onCollapsedChange={vi.fn()}>
        content
      </ResizablePanel>,
    )

    await expectNoViolations(container)
  })
})
