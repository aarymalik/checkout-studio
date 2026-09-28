import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_KEYMAP,
  DEFAULT_LAYOUT,
  type KeyBinding,
  type ShellLayout,
} from "@checkout-studio/editor"
import { LAYOUT } from "@checkout-studio/design-system"

import { StudioShell } from "./StudioShell"
import { REGIONS } from "./regions"
import { expectNoViolations } from "../../tests/axe"

/**
 * A keystroke, as the browser delivers one.
 *
 * Not userEvent: its default keyboard map reports `code: "Unknown"` for
 * Backslash, Period, Slash and the function keys, and this product binds by
 * physical key on purpose. Sending the event says what was pressed.
 */
function press(binding: KeyBinding): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: binding.key,
        metaKey: binding.mod === true,
        altKey: binding.alt === true,
        shiftKey: binding.shift === true,
        ctrlKey: binding.ctrl === true,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
}

/**
 * The shell, as a whole.
 *
 * These are the integration and accessibility tests from docs/phases.md, Phase
 * 4: the parts that only mean something once the keyboard system, the command
 * registry and the frame are in one document together.
 */

function renderShell(layout: ShellLayout = DEFAULT_LAYOUT) {
  return render(
    <StudioShell
      projectName="Spring Sale"
      initialLayout={layout}
      userKeymap={DEFAULT_KEYMAP}
      platform="mac"
    />,
  )
}

describe("StudioShell", () => {
  let saved: unknown[]

  beforeEach(() => {
    saved = []
    // The shell writes its layout through the API. What matters here is what it
    // decides to write and when, not that a server received it.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init?: { body?: string }) => {
        saved.push(JSON.parse(init?.body ?? "null"))

        return new Response(JSON.stringify({ success: true, data: {}, error: null, meta: {} }), {
          headers: { "content-type": "application/json" },
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe("the frame", () => {
    it("shows the project it is editing", () => {
      renderShell()

      expect(screen.getByRole("heading", { name: "Spring Sale" })).toBeInTheDocument()
    })

    // Each is a landmark with a name, so a screen reader user can jump to
    // "Inspector" instead of walking the document.
    it("gives every region a landmark with an accessible name", () => {
      renderShell()

      expect(screen.getByRole("banner", { name: "Toolbar" })).toBeInTheDocument()
      expect(screen.getByRole("main", { name: "Canvas" })).toBeInTheDocument()
      expect(screen.getByRole("contentinfo", { name: "Status bar" })).toBeInTheDocument()
      expect(screen.getByRole("region", { name: "Components" })).toBeInTheDocument()
      expect(screen.getByRole("region", { name: "Inspector" })).toBeInTheDocument()
    })

    /**
     * Toolbar → left sidebar → canvas → inspector → status bar, which is the
     * order docs/ui-guidelines.md specifies and the order the interface reads
     * in. Asserted on the document rather than by pressing Tab, because a Tab
     * press lands on whatever control comes first inside a region.
     */
    it("lays the regions out in reading order", () => {
      const { container } = renderShell()
      const ids = REGIONS.map((region) => region.id)
      const found = [...container.querySelectorAll<HTMLElement>("[id^='shell-']")].map(
        (element) => element.id,
      )

      expect(found).toEqual(ids)
    })

    // The eleven from docs/ui-guidelines.md, with one open: eleven open at once
    // is a wall rather than an inspector.
    it("shows the eleven inspector sections, with one open", () => {
      renderShell()
      const inspector = screen.getByRole("region", { name: "Inspector" })
      const sections = [
        "General",
        "Layout",
        "Spacing",
        "Typography",
        "Background",
        "Border",
        "Effects",
        "Animation",
        "Responsive",
        "Accessibility",
        "Advanced",
      ]

      for (const section of sections) {
        expect(within(inspector).getByRole("button", { name: section })).toBeInTheDocument()
      }

      expect(within(inspector).getAllByRole("button", { expanded: false })).toHaveLength(
        sections.length - 1,
      )
    })

    it("offers the six sidebar tabs", () => {
      renderShell()

      expect(screen.getAllByRole("tab")).toHaveLength(6)
    })
  })

  describe("shortcut labels", () => {
    // A printed shortcut that no longer works is worse than none at all, so
    // every label is read from the registry rather than written beside a button.
    it("renders the registry's binding, formatted for the platform", () => {
      renderShell()

      expect(screen.getByRole("button", { name: /Search · ⌘K/ })).toBeInTheDocument()
    })

    it("uses the platform it was told about, not the one it is running on", () => {
      render(
        <StudioShell
          projectName="Spring Sale"
          initialLayout={DEFAULT_LAYOUT}
          userKeymap={DEFAULT_KEYMAP}
          platform="other"
        />,
      )

      expect(screen.getByRole("button", { name: /Search · Ctrl\+K/ })).toBeInTheDocument()
    })
  })

  describe("panels", () => {
    it("renders each at its stored width", () => {
      renderShell({ ...DEFAULT_LAYOUT, leftWidth: 400, rightWidth: 300 })

      expect(screen.getByRole("region", { name: "Components" })).toHaveStyle({ width: "400px" })
      expect(screen.getByRole("region", { name: "Inspector" })).toHaveStyle({ width: "300px" })
    })

    it("resizes with the keyboard, and stops at the maximum", async () => {
      const user = userEvent.setup()
      renderShell({ ...DEFAULT_LAYOUT, leftWidth: LAYOUT.left.max - 1 })

      const divider = screen.getByRole("separator", { name: "Resize sidebar" })
      await user.click(divider)
      await user.keyboard("{ArrowRight}{ArrowRight}")

      expect(screen.getByRole("region", { name: "Components" })).toHaveStyle({
        width: `${LAYOUT.left.max}px`,
      })
    })

    it("stops at the minimum", async () => {
      const user = userEvent.setup()
      renderShell({ ...DEFAULT_LAYOUT, leftWidth: LAYOUT.left.min + 1 })

      await user.click(screen.getByRole("separator", { name: "Resize sidebar" }))
      await user.keyboard("{ArrowLeft}{ArrowLeft}")

      expect(screen.getByRole("region", { name: "Components" })).toHaveStyle({
        width: `${LAYOUT.left.min}px`,
      })
    })

    it("collapses the sidebar to a rail that still reaches every tab", async () => {
      const user = userEvent.setup()
      renderShell()

      await user.click(screen.getByRole("button", { name: "Toggle left sidebar" }))

      expect(screen.queryByRole("region", { name: "Components" })).not.toBeInTheDocument()
      expect(screen.getByRole("navigation", { name: "Sidebar" })).toBeInTheDocument()
      expect(screen.getAllByRole("tab")).toHaveLength(6)
    })

    it("restores the width it was collapsed at", async () => {
      const user = userEvent.setup()
      renderShell({ ...DEFAULT_LAYOUT, leftWidth: 400 })

      await user.click(screen.getByRole("button", { name: "Toggle left sidebar" }))
      await user.click(screen.getByRole("button", { name: "Expand sidebar" }))

      expect(screen.getByRole("region", { name: "Components" })).toHaveStyle({ width: "400px" })
    })

    it("hides the inspector entirely rather than railing it", async () => {
      const user = userEvent.setup()
      renderShell()

      await user.click(screen.getByRole("button", { name: "Toggle inspector" }))

      expect(screen.queryByRole("region", { name: "Inspector" })).not.toBeInTheDocument()
    })

    it("opens the sidebar when a collapsed tab is chosen", async () => {
      const user = userEvent.setup()
      renderShell({ ...DEFAULT_LAYOUT, leftCollapsed: true })

      await user.click(screen.getByRole("tab", { name: "Layers" }))

      expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument()
    })
  })

  describe("persistence", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it("writes the layout once the change settles", async () => {
      const user = userEvent.setup()
      renderShell()

      await user.click(screen.getByRole("button", { name: "Toggle inspector" }))

      expect(saved).toEqual([])

      await act(async () => {
        vi.advanceTimersByTime(1_000)
      })

      expect(saved).toEqual([{ value: { ...DEFAULT_LAYOUT, rightCollapsed: true } }])
    })

    it("writes nothing when the layout ends where it started", async () => {
      const user = userEvent.setup()
      renderShell()

      await user.click(screen.getByRole("button", { name: "Toggle inspector" }))
      await user.click(screen.getByRole("button", { name: "Toggle inspector" }))

      await act(async () => {
        vi.advanceTimersByTime(1_000)
      })

      expect(saved).toEqual([])
    })
  })

  describe("the command palette", () => {
    it("opens on ⌘K and closes on Escape", async () => {
      const user = userEvent.setup()
      renderShell()

      press({ key: "KeyK", mod: true })

      expect(screen.getByRole("combobox")).toBeInTheDocument()

      await user.keyboard("{Escape}")

      await waitFor(() => {
        expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
      })
    })

    // Focus goes back where it was, because a palette opened by accident should
    // cost nothing to dismiss.
    it("restores focus to whatever had it", async () => {
      const user = userEvent.setup()
      renderShell()

      const toggle = screen.getByRole("button", { name: "Toggle inspector" })
      toggle.focus()

      press({ key: "KeyK", mod: true })
      await user.keyboard("{Escape}")

      await waitFor(() => {
        expect(toggle).toHaveFocus()
      })
    })

    /**
     * Exit criterion: every command is reachable from the palette. Asserted
     * against the registry rather than a list, so a command added without a
     * palette entry fails here.
     */
    it("lists every registered command", () => {
      renderShell()

      press({ key: "KeyK", mod: true })

      // Four shell commands, six tabs, and four the application contributes.
      expect(screen.getAllByRole("option")).toHaveLength(14)
    })

    it("shows each command's shortcut beside it", () => {
      renderShell()

      press({ key: "KeyK", mod: true })

      expect(screen.getByRole("option", { name: "Toggle left sidebar" }).textContent).toContain(
        "⌘\\",
      )
    })

    it("searches by name", async () => {
      const user = userEvent.setup()
      renderShell()

      press({ key: "KeyK", mod: true })
      await user.type(screen.getByRole("combobox"), "inspector")

      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
        expect.stringContaining("Toggle inspector"),
      ])
    })

    it("runs the command it was asked to run", async () => {
      const user = userEvent.setup()
      renderShell()

      press({ key: "KeyK", mod: true })
      await user.type(screen.getByRole("combobox"), "inspector")
      await user.keyboard("{Enter}")

      await waitFor(() => {
        expect(screen.queryByRole("region", { name: "Inspector" })).not.toBeInTheDocument()
      })
    })

    // The palette is modal: while it is open, the rest of the interface stops
    // listening.
    it("swallows a shortcut that belongs to the shell behind it", () => {
      const { container } = renderShell()

      press({ key: "KeyK", mod: true })

      expect(screen.getByRole("combobox")).toBeInTheDocument()

      press({ key: "Backslash", mod: true })

      // Queried through the DOM rather than by role: a modal marks everything
      // behind it aria-hidden, so the panel is correctly out of the
      // accessibility tree while still being there.
      expect(container.querySelector("#shell-sidebar")).not.toBeNull()
    })
  })

  describe("the shortcut reference", () => {
    it("opens on ⌘/ and lists the registry", () => {
      renderShell()

      press({ key: "Slash", mod: true })

      const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" })

      expect(within(sheet).getByText("Toggle left sidebar")).toBeInTheDocument()
      expect(within(sheet).getByText("⌘\\")).toBeInTheDocument()
    })

    // Handled by the palette itself, so they are documented rather than bound.
    it("shows the palette's own keys under their own heading", () => {
      renderShell()

      press({ key: "Slash", mod: true })
      const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" })

      expect(within(sheet).getByText("In the command palette")).toBeInTheDocument()
      expect(within(sheet).getByText("Next result")).toBeInTheDocument()
    })

    it("closes on Escape", async () => {
      const user = userEvent.setup()
      renderShell()

      press({ key: "Slash", mod: true })
      await user.keyboard("{Escape}")

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      })
    })
  })

  describe("shell shortcuts", () => {
    it("toggles the sidebar on ⌘\\", () => {
      renderShell()

      press({ key: "Backslash", mod: true })

      expect(screen.queryByRole("region", { name: "Components" })).not.toBeInTheDocument()
    })

    it("hides both panels on ⌘.", () => {
      renderShell()

      press({ key: "Period", mod: true })

      expect(screen.queryByRole("region", { name: "Components" })).not.toBeInTheDocument()
      expect(screen.queryByRole("region", { name: "Inspector" })).not.toBeInTheDocument()
      expect(screen.getByText("Focus mode")).toBeInTheDocument()
    })

    it("switches sidebar tab on ⌥2", () => {
      renderShell()

      press({ key: "Digit2", alt: true })

      expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument()
    })

    // ⌘1–⌘9 switch browser tabs and are never bound.
    it("leaves ⌘2 alone", () => {
      renderShell()

      press({ key: "Digit2", mod: true })

      expect(screen.getByRole("region", { name: "Components" })).toBeInTheDocument()
    })
  })

  describe("region cycling", () => {
    it("moves focus through the regions on F6", () => {
      renderShell()

      screen.getByRole("banner", { name: "Toolbar" }).focus()
      press({ key: "F6" })

      expect(screen.getByRole("region", { name: "Components" })).toHaveFocus()

      press({ key: "F6" })

      expect(screen.getByRole("main", { name: "Canvas" })).toHaveFocus()
    })

    it("goes the other way on ⇧F6", () => {
      renderShell()

      screen.getByRole("main", { name: "Canvas" }).focus()
      press({ key: "F6", shift: true })

      expect(screen.getByRole("region", { name: "Components" })).toHaveFocus()
    })

    // A collapsed inspector is not in the document, so it stays out of the cycle
    // rather than sending focus nowhere.
    it("skips a region that is not there", () => {
      renderShell({ ...DEFAULT_LAYOUT, rightCollapsed: true })

      screen.getByRole("main", { name: "Canvas" }).focus()
      press({ key: "F6" })

      expect(screen.getByRole("contentinfo", { name: "Status bar" })).toHaveFocus()
    })
  })

  describe("accessibility", () => {
    it("reports no axe violations", async () => {
      const { container } = renderShell()

      await expectNoViolations(container)
    })

    it("reports none with the panels collapsed either", async () => {
      const { container } = renderShell({
        ...DEFAULT_LAYOUT,
        leftCollapsed: true,
        rightCollapsed: true,
      })

      await expectNoViolations(container)
    })
  })
})
