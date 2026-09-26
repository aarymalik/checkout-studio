import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PointerEventsCheckLevel } from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../primitives/Button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "./Dialog"
import { expectNoViolations } from "../../tests/axe"

/**
 * Clicks the backdrop.
 *
 * Radix sets `pointer-events: none` on the body while a modal is open, so
 * user-event refuses the click: its guard exists to catch a click a real user
 * could not make, and here the element it would actually hit is the overlay.
 * jsdom has no layout to tell it that, so the guard is turned off for this one
 * interaction and the overlay is named explicitly.
 */
async function clickBackdrop(): Promise<void> {
  const overlay = document.querySelector('[data-slot="dialog-overlay"]')
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

  await user.click(overlay as Element)
}

function Confirm(props: Partial<Parameters<typeof DialogContent>[0]> = {}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Delete page</Button>
      </DialogTrigger>
      <DialogContent title="Delete this page?" description="This cannot be undone." {...props}>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="danger">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe("Dialog", () => {
  it("is closed until something opens it", () => {
    render(<Confirm />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens from its trigger", async () => {
    render(<Confirm />)

    await userEvent.click(screen.getByRole("button", { name: "Delete page" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("is named by its title, so it is not announced as just 'dialog'", async () => {
    render(<Confirm />)

    await userEvent.click(screen.getByRole("button", { name: "Delete page" }))

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Delete this page?")
  })

  it("is described by its description", async () => {
    render(<Confirm />)

    await userEvent.click(screen.getByRole("button", { name: "Delete page" }))

    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("This cannot be undone.")
  })

  it("renders its title as a heading, not only as a name", async () => {
    render(<Confirm />)

    await userEvent.click(screen.getByRole("button", { name: "Delete page" }))

    expect(screen.getByRole("heading", { name: "Delete this page?" })).toBeInTheDocument()
  })

  it.each(["sm", "md", "lg"] as const)("renders at %s", async (size) => {
    render(<Confirm size={size} />)

    await userEvent.click(screen.getByRole("button", { name: "Delete page" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  describe("focus", () => {
    it("moves into the dialog when it opens", async () => {
      render(<Confirm />)

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))

      expect(screen.getByRole("dialog")).toContainElement(
        document.activeElement as HTMLElement | null,
      )
    })

    it("returns to whatever opened it", async () => {
      // Dropping focus to the body on close is how a keyboard user loses their
      // place in the page.
      render(<Confirm />)
      const trigger = screen.getByRole("button", { name: "Delete page" })

      await userEvent.click(trigger)
      await userEvent.keyboard("{Escape}")

      expect(trigger).toHaveFocus()
    })

    it("cannot be left with Tab while it is open", async () => {
      render(
        <>
          <Confirm />
          <Button>Outside</Button>
        </>,
      )

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))
      await userEvent.tab()
      await userEvent.tab()
      await userEvent.tab()
      await userEvent.tab()

      expect(screen.getByRole("dialog")).toContainElement(
        document.activeElement as HTMLElement | null,
      )
    })
  })

  describe("closing", () => {
    it("closes on Escape", async () => {
      render(<Confirm />)

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))
      await userEvent.keyboard("{Escape}")

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("closes from its close button", async () => {
      render(<Confirm />)

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))
      await userEvent.click(screen.getByRole("button", { name: "Close" }))

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("closes from a DialogClose inside it", async () => {
      render(<Confirm />)

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("closes when the backdrop is clicked", async () => {
      render(<Confirm />)

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))
      await clickBackdrop()

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("keeps a destructive dialog open when the backdrop is clicked", async () => {
      // docs/design-system.md: click outside closes unless destructive. A
      // misplaced click should not be able to discard work.
      render(<Confirm dismissOnClickOutside={false} />)

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))
      await clickBackdrop()

      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("still closes a destructive dialog on Escape, so nobody is trapped", async () => {
      render(<Confirm dismissOnClickOutside={false} />)

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))
      await userEvent.keyboard("{Escape}")

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
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent title="Settings">body</DialogContent>
            </Dialog>
          </>
        )
      }

      render(<Controlled />)

      await userEvent.click(screen.getByRole("button", { name: "Open" }))
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      await userEvent.keyboard("{Escape}")
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("reports every open and close", async () => {
      const onOpenChange = vi.fn()
      render(
        <Dialog onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent title="Settings">body</DialogContent>
        </Dialog>,
      )

      await userEvent.click(screen.getByRole("button", { name: "Open" }))
      expect(onOpenChange).toHaveBeenCalledWith(true)

      await userEvent.keyboard("{Escape}")
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it("hides the page behind it from assistive technology", async () => {
    // Otherwise a screen reader can walk out of the dialog into content the
    // reader cannot see or reach.
    const { container } = render(
      <>
        <Confirm />
        <main>Behind</main>
      </>,
    )

    await userEvent.click(screen.getByRole("button", { name: "Delete page" }))

    // Radix hides the portal's siblings at the body level rather than walking
    // the tree, so the whole rendered page — this container — is what carries
    // the attribute.
    expect(container).toHaveAttribute("aria-hidden", "true")

    // Which is the point: the content behind is gone from the accessibility
    // tree, so a screen reader cannot walk out of the dialog into it.
    expect(screen.queryByRole("main")).not.toBeInTheDocument()
  })

  describe("accessibility", () => {
    it("reports no axe violations while open", async () => {
      render(<Confirm />)

      await userEvent.click(screen.getByRole("button", { name: "Delete page" }))

      await expectNoViolations(document.body)
    })

    it("reports no axe violations without a description", async () => {
      render(
        <Dialog defaultOpen>
          <DialogContent title="Settings">body</DialogContent>
        </Dialog>,
      )

      await expectNoViolations(document.body)
    })
  })
})
