import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Copy } from "lucide-react"
import { describe, expect, it, vi } from "vitest"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ContextMenu"
import { menuContentClassName, menuItemClassName } from "./DropdownMenu"
import { expectNoViolations } from "../../tests/axe"

function Canvas({ onDuplicate = vi.fn() } = {}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div>Canvas</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Element</ContextMenuLabel>
        <ContextMenuItem icon={<Copy />} shortcut="⌘D" onSelect={onDuplicate}>
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

describe("ContextMenu", () => {
  it("stays closed until it is asked for", () => {
    render(<Canvas />)

    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("opens on right-click", async () => {
    render(<Canvas />)

    await userEvent.pointer({ target: screen.getByText("Canvas"), keys: "[MouseRight]" })

    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(screen.getAllByRole("menuitem")).toHaveLength(2)
  })

  it("runs the item that was chosen", async () => {
    const onDuplicate = vi.fn()
    render(<Canvas onDuplicate={onDuplicate} />)

    await userEvent.pointer({ target: screen.getByText("Canvas"), keys: "[MouseRight]" })
    await userEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }))

    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })

  it("closes on Escape", async () => {
    render(<Canvas />)

    await userEvent.pointer({ target: screen.getByText("Canvas"), keys: "[MouseRight]" })
    await userEvent.keyboard("{Escape}")

    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("moves through items with the arrow keys", async () => {
    render(<Canvas />)

    await userEvent.pointer({ target: screen.getByText("Canvas"), keys: "[MouseRight]" })
    await userEvent.keyboard("{ArrowDown}")

    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus()
  })

  it("keeps the shortcut out of the item's name", async () => {
    render(<Canvas />)

    await userEvent.pointer({ target: screen.getByText("Canvas"), keys: "[MouseRight]" })

    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveTextContent("⌘D")
  })

  it("looks the same as the dropdown menu by sharing its classes, not by resembling it", async () => {
    // Two menus reached two ways. A reader who has learned one has learned the
    // other, which only holds if they cannot drift apart.
    render(<Canvas />)

    await userEvent.pointer({ target: screen.getByText("Canvas"), keys: "[MouseRight]" })

    expect(screen.getByRole("menu").className).toContain(menuContentClassName)
    expect(screen.getByRole("menuitem", { name: "Duplicate" }).className).toContain(
      menuItemClassName,
    )
  })

  it("reports no axe violations while open", async () => {
    render(<Canvas />)

    await userEvent.pointer({ target: screen.getByText("Canvas"), keys: "[MouseRight]" })

    await expectNoViolations(document.body)
  })
})
