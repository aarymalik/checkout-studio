import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Copy, Trash2 } from "lucide-react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../primitives/Button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  menuContentClassName,
} from "./DropdownMenu"
import { expectNoViolations } from "../../tests/axe"

function PageActions({ onDuplicate = vi.fn() } = {}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Page</DropdownMenuLabel>
        <DropdownMenuItem icon={<Copy />} shortcut="⌘D" onSelect={onDuplicate}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Move to folder</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Trash2 />} destructive>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe("DropdownMenu", () => {
  it("keeps its items out of the document until it opens", () => {
    render(<PageActions />)

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()
  })

  it("opens from its trigger as a menu", async () => {
    render(<PageActions />)

    await userEvent.click(screen.getByRole("button", { name: "Actions" }))

    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(screen.getAllByRole("menuitem")).toHaveLength(3)
  })

  it("tells assistive technology that the trigger opens a menu", async () => {
    render(<PageActions />)

    expect(screen.getByRole("button", { name: "Actions" })).toHaveAttribute("aria-haspopup", "menu")
  })

  it("reports the trigger's open state", async () => {
    render(<PageActions />)
    const trigger = screen.getByRole("button", { name: "Actions" })

    expect(trigger).toHaveAttribute("aria-expanded", "false")

    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute("aria-expanded", "true")
  })

  it("runs the item that was chosen", async () => {
    const onDuplicate = vi.fn()
    render(<PageActions onDuplicate={onDuplicate} />)

    await userEvent.click(screen.getByRole("button", { name: "Actions" }))
    await userEvent.click(screen.getByRole("menuitem", { name: /Duplicate/ }))

    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })

  it("closes once an item is chosen", async () => {
    render(<PageActions />)

    await userEvent.click(screen.getByRole("button", { name: "Actions" }))
    await userEvent.click(screen.getByRole("menuitem", { name: /Duplicate/ }))

    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("shows a shortcut as a hint on the right", async () => {
    render(<PageActions />)

    await userEvent.click(screen.getByRole("button", { name: "Actions" }))

    expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toHaveTextContent("⌘D")
  })

  it("keeps the icon and the shortcut out of the item's name", async () => {
    // Announced, "Duplicate⌘D" is the label with two symbols stuck to it. Both
    // the icon and the shortcut are visual hints; the label is the name.
    render(<PageActions />)

    await userEvent.click(screen.getByRole("button", { name: "Actions" }))

    expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toHaveAccessibleName("Duplicate")
  })

  it("marks a disabled item as disabled rather than hiding it", async () => {
    // Removing it would move everything else, and leave the reader wondering
    // where the action went.
    render(<PageActions />)

    await userEvent.click(screen.getByRole("button", { name: "Actions" }))

    expect(screen.getByRole("menuitem", { name: "Move to folder" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })

  it("does not run a disabled item", async () => {
    const onSelect = vi.fn()
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuContent>
          <DropdownMenuItem disabled onSelect={onSelect}>
            Unavailable
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    await userEvent.click(screen.getByRole("menuitem"))

    expect(onSelect).not.toHaveBeenCalled()
  })

  describe("keyboard", () => {
    it("opens with Enter from the trigger", async () => {
      render(<PageActions />)

      await userEvent.tab()
      await userEvent.keyboard("{Enter}")

      expect(screen.getByRole("menu")).toBeInTheDocument()
    })

    it("moves through items with the arrow keys, skipping the disabled one", async () => {
      render(<PageActions />)

      await userEvent.click(screen.getByRole("button", { name: "Actions" }))
      await userEvent.keyboard("{ArrowDown}")
      expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toHaveFocus()

      await userEvent.keyboard("{ArrowDown}")
      expect(screen.getByRole("menuitem", { name: /Delete/ })).toHaveFocus()
    })

    it("chooses the focused item with Enter", async () => {
      const onDuplicate = vi.fn()
      render(<PageActions onDuplicate={onDuplicate} />)

      await userEvent.click(screen.getByRole("button", { name: "Actions" }))
      await userEvent.keyboard("{ArrowDown}{Enter}")

      expect(onDuplicate).toHaveBeenCalledTimes(1)
    })

    it("closes on Escape and returns focus to the trigger", async () => {
      render(<PageActions />)
      const trigger = screen.getByRole("button", { name: "Actions" })

      await userEvent.click(trigger)
      await userEvent.keyboard("{Escape}")

      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })

    it("finds an item by typing its first letters", async () => {
      render(<PageActions />)

      await userEvent.click(screen.getByRole("button", { name: "Actions" }))
      await userEvent.keyboard("del")

      expect(screen.getByRole("menuitem", { name: /Delete/ })).toHaveFocus()
    })
  })

  describe("checkbox items", () => {
    it("announces whether they are checked", async () => {
      function Columns() {
        const [showSlug, setShowSlug] = useState(true)
        return (
          <DropdownMenu defaultOpen>
            <DropdownMenuContent>
              <DropdownMenuCheckboxItem checked={showSlug} onCheckedChange={setShowSlug}>
                Slug
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }

      render(<Columns />)

      expect(screen.getByRole("menuitemcheckbox", { name: "Slug" })).toBeChecked()
    })

    it("toggles", async () => {
      const onCheckedChange = vi.fn()
      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem checked={false} onCheckedChange={onCheckedChange}>
              Slug
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      )

      await userEvent.click(screen.getByRole("menuitemcheckbox"))

      expect(onCheckedChange).toHaveBeenCalledWith(true)
    })
  })

  it("colours a destructive item as destructive", async () => {
    render(<PageActions />)

    await userEvent.click(screen.getByRole("button", { name: "Actions" }))

    expect(screen.getByRole("menuitem", { name: /Delete/ }).className).toContain("text-danger")
  })

  describe("submenus", () => {
    it("opens a submenu from its trigger, and runs an item inside it", async () => {
      const onSelect = vi.fn()

      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={onSelect}>Archive</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>,
      )

      const trigger = screen.getByRole("menuitem", { name: "Move to" })
      expect(trigger).toHaveAttribute("aria-haspopup", "menu")
      expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument()

      // Keyboard rather than hover: opening a submenu on hover depends on a
      // grace area computed from geometry, which jsdom does not have.
      trigger.focus()
      await userEvent.keyboard("{ArrowRight}")

      // A submenu is the same menu one level down, and shares its classes so
      // the two cannot drift apart.
      const [, submenu] = screen.getAllByRole("menu")
      expect(submenu?.className).toContain(menuContentClassName)

      await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }))

      expect(onSelect).toHaveBeenCalledTimes(1)
    })
  })

  it("reports no axe violations while open", async () => {
    render(<PageActions />)

    await userEvent.click(screen.getByRole("button", { name: "Actions" }))

    await expectNoViolations(document.body)
  })
})
