import { render, screen } from "@testing-library/react"
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../primitives/Button"
import { Input } from "../primitives/Input"
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./Popover"
import { expectNoViolations } from "../../tests/axe"

function Rename() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Rename</Button>
      </PopoverTrigger>
      <PopoverContent label="Rename page">
        <Input label="Name" defaultValue="Home" />
        <PopoverClose asChild>
          <Button>Save</Button>
        </PopoverClose>
      </PopoverContent>
    </Popover>
  )
}

describe("Popover", () => {
  it("is closed until something opens it", () => {
    render(<Rename />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens from its trigger", async () => {
    render(<Rename />)

    await userEvent.click(screen.getByRole("button", { name: "Rename" }))

    expect(screen.getByRole("dialog", { name: "Rename page" })).toBeInTheDocument()
  })

  it("is named, so it is not announced as nothing", async () => {
    render(<Rename />)

    await userEvent.click(screen.getByRole("button", { name: "Rename" }))

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Rename page")
  })

  it("leaves the page behind it reachable, unlike a dialog", async () => {
    // This is the whole reason to use a popover: the work stays visible and
    // assistive technology can still reach it.
    const { container } = render(
      <>
        <Rename />
        <main>Behind</main>
      </>,
    )

    await userEvent.click(screen.getByRole("button", { name: "Rename" }))

    expect(container).not.toHaveAttribute("aria-hidden")
    expect(screen.getByRole("main")).toBeInTheDocument()
  })

  describe("focus", () => {
    it("moves into the popover on open", async () => {
      render(<Rename />)

      await userEvent.click(screen.getByRole("button", { name: "Rename" }))

      expect(screen.getByRole("dialog")).toContainElement(
        document.activeElement as HTMLElement | null,
      )
    })

    it("returns to the trigger on close", async () => {
      render(<Rename />)
      const trigger = screen.getByRole("button", { name: "Rename" })

      await userEvent.click(trigger)
      await userEvent.keyboard("{Escape}")

      expect(trigger).toHaveFocus()
    })
  })

  describe("closing", () => {
    it("closes on Escape", async () => {
      render(<Rename />)

      await userEvent.click(screen.getByRole("button", { name: "Rename" }))
      await userEvent.keyboard("{Escape}")

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("closes from a PopoverClose inside it", async () => {
      render(<Rename />)

      await userEvent.click(screen.getByRole("button", { name: "Rename" }))
      await userEvent.click(screen.getByRole("button", { name: "Save" }))

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("closes when something outside it is clicked", async () => {
      render(
        <>
          <Rename />
          <Button>Elsewhere</Button>
        </>,
      )

      await userEvent.click(screen.getByRole("button", { name: "Rename" }))

      const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })
      await user.click(screen.getByRole("button", { name: "Elsewhere" }))

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  describe("controlled", () => {
    it("opens and closes at its owner's word", async () => {
      function Controlled() {
        const [open, setOpen] = useState(false)
        return (
          <>
            <Button onClick={() => setOpen(true)}>Open</Button>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverContent label="Options">body</PopoverContent>
            </Popover>
          </>
        )
      }

      render(<Controlled />)

      await userEvent.click(screen.getByRole("button", { name: "Open" }))
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      await userEvent.keyboard("{Escape}")
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("reports each change", async () => {
      const onOpenChange = vi.fn()
      render(
        <Popover onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <Button>Open</Button>
          </PopoverTrigger>
          <PopoverContent label="Options">body</PopoverContent>
        </Popover>,
      )

      await userEvent.click(screen.getByRole("button", { name: "Open" }))

      expect(onOpenChange).toHaveBeenCalledWith(true)
    })
  })

  it("lets the caller's className win a conflict", async () => {
    render(
      <Popover defaultOpen>
        <PopoverContent label="Options" className="rounded-modal">
          body
        </PopoverContent>
      </Popover>,
    )

    const classes = screen.getByRole("dialog").className.split(" ")
    expect(classes).toContain("rounded-modal")
    expect(classes).not.toContain("rounded-control")
  })

  it("reports no axe violations while open", async () => {
    render(<Rename />)

    await userEvent.click(screen.getByRole("button", { name: "Rename" }))

    await expectNoViolations(document.body)
  })
})
