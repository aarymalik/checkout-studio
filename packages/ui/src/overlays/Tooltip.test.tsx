import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Button } from "../primitives/Button"
import { Tooltip, TooltipProvider } from "./Tooltip"
import { expectNoViolations } from "../../tests/axe"

function Toolbar(props: Partial<Parameters<typeof Tooltip>[0]> = {}) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip content="Undo" {...props}>
        <Button aria-label="Undo">↶</Button>
      </Tooltip>
    </TooltipProvider>
  )
}

describe("Tooltip", () => {
  it("stays out of the document until it is wanted", () => {
    render(<Toolbar />)

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("appears on hover", async () => {
    render(<Toolbar />)

    await userEvent.hover(screen.getByRole("button"))

    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Undo"))
  })

  it("appears on keyboard focus, not only on hover", async () => {
    // A tooltip only a mouse can reach is a tooltip a keyboard user does not
    // have.
    render(<Toolbar />)

    await userEvent.tab()

    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument())
  })

  it("disappears when the pointer leaves", async () => {
    render(<Toolbar />)

    await userEvent.hover(screen.getByRole("button"))
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument())

    await userEvent.unhover(screen.getByRole("button"))

    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument())
  })

  it("closes on Escape", async () => {
    render(<Toolbar />)

    await userEvent.tab()
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument())

    await userEvent.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument())
  })

  it("shows a keyboard shortcut alongside the label", async () => {
    render(<Toolbar shortcut="⌘Z" />)

    await userEvent.hover(screen.getByRole("button"))

    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Undo⌘Z"))
  })

  it("does not become the trigger's accessible name", async () => {
    // The trigger keeps its own label. A tooltip is supplementary: it is not
    // reachable by touch and is announced inconsistently, so nothing a reader
    // needs in order to act may live only here.
    render(<Toolbar />)

    await userEvent.hover(screen.getByRole("button"))
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument())

    expect(screen.getByRole("button")).toHaveAccessibleName("Undo")
  })

  it("waits before appearing, so crossing a toolbar does not set off a row of them", async () => {
    render(
      <TooltipProvider delayDuration={400}>
        <Tooltip content="Undo">
          <Button aria-label="Undo">↶</Button>
        </Tooltip>
      </TooltipProvider>,
    )

    await userEvent.hover(screen.getByRole("button"))

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it.each(["top", "right", "bottom", "left"] as const)("renders on the %s", async (side) => {
    render(<Toolbar side={side} />)

    await userEvent.hover(screen.getByRole("button"))

    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument())
  })

  it("reports no axe violations while open", async () => {
    render(<Toolbar shortcut="⌘Z" />)

    await userEvent.hover(screen.getByRole("button"))
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument())

    await expectNoViolations(document.body)
  })
})
