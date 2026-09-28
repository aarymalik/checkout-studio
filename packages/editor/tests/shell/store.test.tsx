import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { LAYOUT } from "@checkout-studio/design-system"

import { DEFAULT_LAYOUT, type ShellLayout } from "../../src/shell/layout"
import { ShellProvider, useRenderedWidths, useShell, useShellActions } from "../../src/shell/store"

function Readout(): ReactNode {
  const { layout } = useShell()
  const widths = useRenderedWidths()
  const actions = useShellActions()

  return (
    <div>
      <span data-testid="layout">{JSON.stringify(layout)}</span>
      <span data-testid="rendered">{JSON.stringify(widths)}</span>
      <button type="button" onClick={() => actions.toggleLeft()}>
        toggle left
      </button>
      <button type="button" onClick={() => actions.toggleRight()}>
        toggle right
      </button>
      <button type="button" onClick={() => actions.toggleBoth()}>
        toggle both
      </button>
      <button type="button" onClick={() => actions.selectTab("layers")}>
        layers
      </button>
      <button type="button" onClick={() => actions.reset()}>
        reset
      </button>
      <button type="button" onClick={() => actions.resizeLeft(9_999)}>
        widen left
      </button>
      <button type="button" onClick={() => actions.resizeRight(1)}>
        narrow right
      </button>
    </div>
  )
}

function layoutOf(): ShellLayout {
  return JSON.parse(screen.getByTestId("layout").textContent ?? "{}") as ShellLayout
}

function renderedWidths(): { left: number; right: number } {
  return JSON.parse(screen.getByTestId("rendered").textContent ?? "{}") as {
    left: number
    right: number
  }
}

describe("ShellProvider", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("starts from the default layout when nothing was stored", () => {
    render(
      <ShellProvider>
        <Readout />
      </ShellProvider>,
    )

    expect(layoutOf()).toEqual(DEFAULT_LAYOUT)
  })

  // Resolved on the server, so the first paint is the layout they left — there
  // is no default arrangement to see and then watch move.
  it("starts from a stored layout", () => {
    const stored: ShellLayout = { ...DEFAULT_LAYOUT, leftWidth: 400, rightCollapsed: true }

    render(
      <ShellProvider initialLayout={stored}>
        <Readout />
      </ShellProvider>,
    )

    expect(layoutOf()).toEqual(stored)
  })

  it("throws a useful error outside a provider", () => {
    expect(() => render(<Readout />)).toThrow("inside a <ShellProvider>")
  })

  describe("resizing", () => {
    it("clamps to the panel's range", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "widen left" }))
      await user.click(screen.getByRole("button", { name: "narrow right" }))

      expect(layoutOf().leftWidth).toBe(LAYOUT.left.max)
      expect(layoutOf().rightWidth).toBe(LAYOUT.right.min)
    })
  })

  describe("collapsing", () => {
    it("toggles each panel independently", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle left" }))

      expect(layoutOf().leftCollapsed).toBe(true)
      expect(layoutOf().rightCollapsed).toBe(false)
    })

    // A collapsed sidebar is a rail of icons, not nothing: the tabs stay
    // reachable, so collapsing is not a trap.
    it("renders the collapsed sidebar as a rail and the inspector as nothing", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle left" }))
      await user.click(screen.getByRole("button", { name: "toggle right" }))

      expect(renderedWidths()).toEqual({ left: LAYOUT.leftCollapsed, right: 0 })
    })

    it("keeps the stored width while collapsed, so restoring returns to it", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider initialLayout={{ ...DEFAULT_LAYOUT, leftWidth: 400 }}>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle left" }))

      expect(layoutOf().leftWidth).toBe(400)

      await user.click(screen.getByRole("button", { name: "toggle left" }))

      expect(renderedWidths().left).toBe(400)
    })
  })

  describe("zen mode", () => {
    it("hides both panels", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle both" }))

      expect(layoutOf().leftCollapsed).toBe(true)
      expect(layoutOf().rightCollapsed).toBe(true)
    })

    // "Get out of my way" should not need a second press to finish.
    it("hides both when only one was open", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider initialLayout={{ ...DEFAULT_LAYOUT, rightCollapsed: true }}>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle both" }))

      expect(layoutOf().leftCollapsed).toBe(true)
      expect(layoutOf().rightCollapsed).toBe(true)
    })

    it("brings both back", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider
          initialLayout={{ ...DEFAULT_LAYOUT, leftCollapsed: true, rightCollapsed: true }}
        >
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle both" }))

      expect(layoutOf().leftCollapsed).toBe(false)
      expect(layoutOf().rightCollapsed).toBe(false)
    })
  })

  describe("tabs", () => {
    // ⌥2 with the sidebar collapsed means "show me the layers".
    it("opens the sidebar when a tab is chosen", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider initialLayout={{ ...DEFAULT_LAYOUT, leftCollapsed: true }}>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "layers" }))

      expect(layoutOf().sidebarTab).toBe("layers")
      expect(layoutOf().leftCollapsed).toBe(false)
    })
  })

  describe("reset", () => {
    it("restores the shipped arrangement", async () => {
      const user = userEvent.setup()
      render(
        <ShellProvider
          initialLayout={{
            leftWidth: 400,
            rightWidth: 460,
            leftCollapsed: true,
            rightCollapsed: true,
            sidebarTab: "theme",
          }}
        >
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "reset" }))

      expect(layoutOf()).toEqual(DEFAULT_LAYOUT)
    })
  })

  describe("persistence", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("writes a changed layout once the drag settles", async () => {
      const onPersist = vi.fn()
      const user = userEvent.setup()
      render(
        <ShellProvider onPersist={onPersist} persistDelayMs={100}>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle left" }))

      expect(onPersist).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(onPersist).toHaveBeenCalledWith({ ...DEFAULT_LAYOUT, leftCollapsed: true })
    })

    // A drag produces a change per frame, and none of them are worth a request.
    it("writes once for a burst of changes", async () => {
      const onPersist = vi.fn()
      const user = userEvent.setup()
      render(
        <ShellProvider onPersist={onPersist} persistDelayMs={100}>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "widen left" }))
      await user.click(screen.getByRole("button", { name: "narrow right" }))
      await user.click(screen.getByRole("button", { name: "toggle left" }))

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(onPersist).toHaveBeenCalledTimes(1)
    })

    it("writes nothing when the layout ends where it started", async () => {
      const onPersist = vi.fn()
      const user = userEvent.setup()
      render(
        <ShellProvider onPersist={onPersist} persistDelayMs={100}>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle left" }))
      await user.click(screen.getByRole("button", { name: "toggle left" }))

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(onPersist).not.toHaveBeenCalled()
    })

    it("writes nothing when the layout has not changed at all", () => {
      const onPersist = vi.fn()
      render(
        <ShellProvider onPersist={onPersist} persistDelayMs={100}>
          <Readout />
        </ShellProvider>,
      )

      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(onPersist).not.toHaveBeenCalled()
    })

    it("writes again after a later change", async () => {
      const onPersist = vi.fn()
      const user = userEvent.setup()
      render(
        <ShellProvider onPersist={onPersist} persistDelayMs={100}>
          <Readout />
        </ShellProvider>,
      )

      await user.click(screen.getByRole("button", { name: "toggle left" }))
      act(() => {
        vi.advanceTimersByTime(100)
      })

      await user.click(screen.getByRole("button", { name: "toggle right" }))
      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(onPersist).toHaveBeenCalledTimes(2)
    })
  })
})
