import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_KEYMAP, type UserKeymap } from "@checkout-studio/editor"

import { KeyboardSettings } from "./KeyboardSettings"
import { expectNoViolations } from "../../../../tests/axe"

/**
 * Settings → Keyboard.
 *
 * Remapping, switching off, resetting, and the WCAG 2.1.4 switch. What matters
 * most is that a refusal says why: a setting that appears to save and does not
 * is how somebody concludes the feature is broken.
 */

type Saved = { url: string; method: string; value: unknown }

describe("KeyboardSettings", () => {
  let saved: Saved[]
  let ok: boolean

  function renderSettings(keymap: UserKeymap = DEFAULT_KEYMAP) {
    return render(<KeyboardSettings initialKeymap={keymap} platform="mac" />)
  }

  /** The button that shows a command's current shortcut. */
  function shortcutOf(title: string): HTMLElement {
    return screen.getByRole("button", { name: `Change the shortcut for ${title}` })
  }

  beforeEach(() => {
    saved = []
    ok = true

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { value?: unknown }
        saved.push({ url, method: init?.method ?? "GET", value: body.value })

        const envelope = ok
          ? { success: true, data: {}, error: null, meta: {} }
          : {
              success: false,
              data: null,
              error: { code: "INTERNAL_ERROR", message: "We could not save that." },
              meta: {},
            }

        return new Response(JSON.stringify(envelope), {
          headers: { "content-type": "application/json" },
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("the list", () => {
    it("shows every shipped shortcut, grouped by where it works", () => {
      renderSettings()

      expect(screen.getByRole("heading", { name: "Anywhere" })).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: "Editor" })).toBeInTheDocument()
      expect(shortcutOf("Open command palette")).toHaveTextContent("⌘K")
      expect(shortcutOf("Toggle left sidebar")).toHaveTextContent("⌘\\")
    })

    // Some commands ship with two spellings — the reference sheet is ⌘/ and also
    // plain ? — and both belong on one row.
    it("puts a command's two spellings on one row", () => {
      renderSettings()

      expect(screen.getAllByRole("button", { name: /Keyboard shortcuts/ })).toHaveLength(1)
      expect(shortcutOf("Keyboard shortcuts")).toHaveTextContent("⌘/ or ⇧/")
    })

    it("shows nothing as changed until something is", () => {
      renderSettings()

      expect(screen.queryByText("Changed")).not.toBeInTheDocument()
    })

    it("uses the platform it was told about", () => {
      render(<KeyboardSettings initialKeymap={DEFAULT_KEYMAP} platform="other" />)

      expect(shortcutOf("Open command palette")).toHaveTextContent("Ctrl+K")
    })

    it("filters by name", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.type(screen.getByRole("searchbox"), "inspector")

      expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })

    it("filters by key, because that is how somebody looks one up", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.type(screen.getByRole("searchbox"), "⌥1")

      expect(screen.getAllByRole("listitem")).toHaveLength(1)
    })

    it("says so when nothing matches", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.type(screen.getByRole("searchbox"), "zzzz")

      expect(screen.getByText("No shortcut matches that.")).toBeInTheDocument()
    })
  })

  describe("remapping", () => {
    it("stores the key that was pressed", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(shortcutOf("Toggle inspector"))
      await user.keyboard("{Meta>}j{/Meta}")

      await waitFor(() => {
        expect(saved).toHaveLength(1)
      })

      expect(saved[0]).toEqual({
        url: "/api/preferences/keyboard.keymap",
        method: "PUT",
        value: {
          characterKeysEnabled: true,
          overrides: [
            {
              commandId: "view.toggle-right-panel",
              scope: "studio",
              binding: { key: "KeyJ", mod: true },
            },
          ],
        },
      })
    })

    it("shows the new key, marked as changed", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(shortcutOf("Toggle inspector"))
      await user.keyboard("{Meta>}j{/Meta}")

      await waitFor(() => {
        expect(shortcutOf("Toggle inspector")).toHaveTextContent("⌘J")
      })

      const row = shortcutOf("Toggle inspector").closest("li") as HTMLElement
      expect(within(row).getByText("Changed")).toBeInTheDocument()
    })

    it("cancels on Escape without storing anything", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(shortcutOf("Toggle inspector"))
      await user.keyboard("{Escape}")

      expect(saved).toEqual([])
      expect(shortcutOf("Toggle inspector")).toHaveTextContent("⇧⌘\\")
    })

    // Refused with a reason rather than accepted and quietly ignored.
    it("refuses a key the browser owns, and says why", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(shortcutOf("Toggle inspector"))
      await user.keyboard("{Meta>}w{/Meta}")

      expect(
        screen.getByText("The browser or the operating system owns this key."),
      ).toBeInTheDocument()
      expect(saved).toEqual([])
    })

    it("refuses a key another command already uses here, and names it", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(shortcutOf("Show Layers"))
      await user.keyboard("{Alt>}1{/Alt}")

      expect(screen.getByText(/view\.sidebar\.components/)).toBeInTheDocument()
      expect(saved).toEqual([])
    })

    // Somebody part-way through a combination has not chosen anything yet.
    it("waits through a modifier pressed on its own", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(shortcutOf("Toggle inspector"))
      await user.keyboard("{Shift}")

      expect(saved).toEqual([])
      expect(screen.getByRole("button", { name: /Press a new shortcut/ })).toBeInTheDocument()
    })

    it("puts the setting back when the save failed", async () => {
      const user = userEvent.setup()
      ok = false
      renderSettings()

      await user.click(shortcutOf("Toggle inspector"))
      await user.keyboard("{Meta>}j{/Meta}")

      await waitFor(() => {
        expect(screen.getByText("We could not save that.")).toBeInTheDocument()
      })

      expect(shortcutOf("Toggle inspector")).toHaveTextContent("⇧⌘\\")
    })
  })

  describe("switching a shortcut off", () => {
    it("stores a null binding", async () => {
      const user = userEvent.setup()
      renderSettings()

      const row = shortcutOf("Toggle inspector").closest("li") as HTMLElement
      await user.click(within(row).getByRole("button", { name: "Switch off" }))

      await waitFor(() => {
        expect(saved[0]?.value).toEqual({
          characterKeysEnabled: true,
          overrides: [{ commandId: "view.toggle-right-panel", scope: "studio", binding: null }],
        })
      })
    })

    it("shows it as off, and offers to restore it", async () => {
      const user = userEvent.setup()
      renderSettings({
        characterKeysEnabled: true,
        overrides: [{ commandId: "view.toggle-right-panel", scope: "studio", binding: null }],
      })

      expect(shortcutOf("Toggle inspector")).toHaveTextContent("Off")

      const row = shortcutOf("Toggle inspector").closest("li") as HTMLElement
      await user.click(within(row).getByRole("button", { name: "Restore" }))

      await waitFor(() => {
        expect(saved[0]?.value).toEqual({ characterKeysEnabled: true, overrides: [] })
      })
    })
  })

  /**
   * WCAG 2.1.4. A shortcut that is a single character with no modifier can be
   * triggered by speech input, so it has to be possible to switch them off.
   */
  describe("single-character shortcuts", () => {
    it("is on to begin with", () => {
      renderSettings()

      expect(screen.getByRole("switch", { name: /Single-character shortcuts/ })).toBeChecked()
    })

    it("switches them off", async () => {
      const user = userEvent.setup()
      renderSettings()

      await user.click(screen.getByRole("switch", { name: /Single-character shortcuts/ }))

      await waitFor(() => {
        expect(saved[0]?.value).toEqual({ characterKeysEnabled: false, overrides: [] })
      })
    })

    it("drops the bare key from the list once they are off", () => {
      renderSettings({ characterKeysEnabled: false, overrides: [] })

      expect(shortcutOf("Keyboard shortcuts")).toHaveTextContent("⌘/")
      expect(shortcutOf("Keyboard shortcuts")).not.toHaveTextContent("⇧/")
    })
  })

  describe("resetting", () => {
    it("is offered only once something has changed", async () => {
      const user = userEvent.setup()
      renderSettings()

      expect(screen.getByRole("button", { name: /Reset all shortcuts/ })).toBeDisabled()

      await user.click(shortcutOf("Toggle inspector"))
      await user.keyboard("{Meta>}j{/Meta}")

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Reset all shortcuts/ })).toBeEnabled()
      })
    })

    it("puts everything back", async () => {
      const user = userEvent.setup()
      renderSettings({
        characterKeysEnabled: false,
        overrides: [
          {
            commandId: "view.toggle-right-panel",
            scope: "studio",
            binding: { key: "KeyJ", mod: true },
          },
        ],
      })

      await user.click(screen.getByRole("button", { name: /Reset all shortcuts/ }))

      await waitFor(() => {
        expect(saved[0]?.value).toEqual(DEFAULT_KEYMAP)
      })

      expect(shortcutOf("Toggle inspector")).toHaveTextContent("⇧⌘\\")
    })
  })

  describe("accessibility", () => {
    it("reports no axe violations", async () => {
      const { container } = renderSettings()

      await expectNoViolations(container)
    })
  })
})
