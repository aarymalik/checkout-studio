import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Button } from "../primitives/Button"
import { CommandPalette } from "./CommandPalette"
import type { PaletteItem } from "./CommandPalette"
import { expectNoViolations } from "../../tests/axe"

const ITEMS: PaletteItem[] = [
  { id: "publish", label: "Publish page", group: "Commands", hint: "⌘⏎", keywords: ["deploy"] },
  { id: "duplicate", label: "Duplicate page", group: "Commands" },
  { id: "home", label: "Home", group: "Pages", hasSubmenu: true },
  { id: "checkout", label: "Checkout", group: "Pages" },
]

function Palette(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  return <CommandPalette open onOpenChange={vi.fn()} items={ITEMS} onSelect={vi.fn()} {...props} />
}

function options(): string[] {
  return screen.getAllByRole("option").map((option) => option.textContent ?? "")
}

function highlighted(): string {
  return screen.getByRole("option", { selected: true }).textContent ?? ""
}

describe("CommandPalette", () => {
  it("is a combobox over a listbox", () => {
    // A listbox rather than a menu, so focus can stay in the field while the
    // highlight moves — which is what lets a reader keep typing.
    render(<Palette />)

    expect(screen.getByRole("combobox")).toBeInTheDocument()
    expect(screen.getByRole("listbox")).toBeInTheDocument()
  })

  it("keeps focus in the field rather than on the results", () => {
    render(<Palette />)

    expect(screen.getByRole("combobox")).toHaveFocus()
  })

  it("points at the highlighted result without moving focus", async () => {
    render(<Palette />)

    const field = screen.getByRole("combobox")
    const active = screen.getByRole("option", { selected: true })

    expect(field).toHaveAttribute("aria-activedescendant", active.id)
    expect(field).toHaveFocus()
  })

  it("shows every item, grouped, until something is typed", () => {
    render(<Palette />)

    expect(options()).toHaveLength(4)
    expect(screen.getByText("Commands")).toBeInTheDocument()
    expect(screen.getByText("Pages")).toBeInTheDocument()
  })

  it("filters as the reader types", async () => {
    render(<Palette />)

    await userEvent.type(screen.getByRole("combobox"), "dup")

    expect(options()).toEqual(["Duplicate page"])
  })

  it("matches on keywords, not only on the label", async () => {
    render(<Palette />)

    await userEvent.type(screen.getByRole("combobox"), "deploy")

    expect(options()[0]).toContain("Publish page")
  })

  it("says so when nothing matches", async () => {
    render(<Palette />)

    await userEvent.type(screen.getByRole("combobox"), "zzz")

    expect(screen.getByText("No results.")).toBeInTheDocument()
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  describe("mode prefixes", () => {
    it("reports the mode so the caller can narrow the list", async () => {
      const onModeChange = vi.fn()
      render(<Palette onModeChange={onModeChange} />)

      await userEvent.type(screen.getByRole("combobox"), "#home")

      expect(onModeChange).toHaveBeenLastCalledWith("pages")
    })

    it("searches on what is left after the prefix", async () => {
      render(<Palette />)

      await userEvent.type(screen.getByRole("combobox"), ">dup")

      expect(options()).toEqual(["Duplicate page"])
    })
  })

  describe("keyboard", () => {
    it("moves the highlight with the arrow keys", async () => {
      render(<Palette />)

      await userEvent.keyboard("{ArrowDown}")

      expect(highlighted()).toContain("Duplicate page")
    })

    it("wraps around the ends", async () => {
      render(<Palette />)

      await userEvent.keyboard("{ArrowUp}")

      expect(highlighted()).toContain("Checkout")
    })

    it("runs the highlighted item on Enter", async () => {
      const onSelect = vi.fn()
      render(<Palette onSelect={onSelect} />)

      await userEvent.keyboard("{Enter}")

      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect.mock.calls[0]?.[0]?.id).toBe("publish")
      expect(onSelect.mock.calls[0]?.[1]).toEqual({ alternate: false })
    })

    it("says when the reader asked for a new context", async () => {
      // ⌘⏎ means "open the page in a new tab", per
      // docs/keyboard-shortcuts.md § Command Palette.
      const onSelect = vi.fn()
      render(<Palette onSelect={onSelect} />)

      await userEvent.keyboard("{Meta>}{Enter}{/Meta}")

      expect(onSelect.mock.calls[0]?.[1]).toEqual({ alternate: true })
    })

    it("enters a sub-menu with Tab, where there is one", async () => {
      const onEnterSubmenu = vi.fn()
      render(<Palette onEnterSubmenu={onEnterSubmenu} />)

      await userEvent.keyboard("{ArrowDown}{ArrowDown}")
      await userEvent.keyboard("{Tab}")

      expect(onEnterSubmenu).toHaveBeenCalledTimes(1)
      expect(onEnterSubmenu.mock.calls[0]?.[0]?.id).toBe("home")
    })

    it("lets Tab move focus when there is no sub-menu to enter", async () => {
      const onEnterSubmenu = vi.fn()
      render(<Palette onEnterSubmenu={onEnterSubmenu} />)

      await userEvent.keyboard("{Tab}")

      expect(onEnterSubmenu).not.toHaveBeenCalled()
    })

    it("closes on Escape", async () => {
      const onOpenChange = vi.fn()
      render(<Palette onOpenChange={onOpenChange} />)

      await userEvent.keyboard("{Escape}")

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it("runs an item that was clicked", async () => {
    const onSelect = vi.fn()
    render(<Palette onSelect={onSelect} />)

    await userEvent.click(screen.getByRole("option", { name: /Duplicate page/ }))

    expect(onSelect.mock.calls[0]?.[0]?.id).toBe("duplicate")
  })

  it("moves the highlight to whatever the pointer is over", async () => {
    render(<Palette />)

    await userEvent.hover(screen.getByRole("option", { name: "Checkout" }))

    expect(highlighted()).toBe("Checkout")
  })

  it("keeps the highlight inside a list that shrinks", async () => {
    // A highlight left pointing past the end of a filtered list highlights
    // nothing, and Enter then does nothing.
    render(<Palette />)

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}")
    await userEvent.type(screen.getByRole("combobox"), "publish")

    expect(highlighted()).toContain("Publish page")
  })

  it("forgets the last search when it reopens", async () => {
    function Reopenable() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          <CommandPalette open={open} onOpenChange={setOpen} items={ITEMS} onSelect={vi.fn()} />
        </>
      )
    }

    render(<Reopenable />)

    await userEvent.type(screen.getByRole("combobox"), "dup")
    await userEvent.keyboard("{Escape}")
    await userEvent.click(screen.getByRole("button", { name: "Open" }))

    expect(screen.getByRole("combobox")).toHaveValue("")
    expect(options()).toHaveLength(4)
  })

  it("keeps its hint out of the option's name", () => {
    render(<Palette />)

    expect(screen.getByRole("option", { name: "Publish page" })).toBeInTheDocument()
  })

  it("reports no axe violations", async () => {
    render(<Palette />)

    await expectNoViolations(document.body)
  })
})
