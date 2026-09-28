import { describe, expect, it } from "vitest"

import {
  defaultShortcuts,
  globalShortcuts,
  paletteKeys,
  shellShortcuts,
} from "../../src/keyboard/defaults"
import { detectConflicts } from "../../src/keyboard/conflicts"
import { serializeBinding } from "../../src/keyboard/normalize"

/** A KeyboardEvent.code, not a character. See docs/keyboard-shortcuts.md. */
const PHYSICAL_KEY =
  /^(Key[A-Z]|Digit[0-9]|F\d{1,2}|Arrow(Up|Down|Left|Right)|Escape|Enter|Tab|Space|Backspace|Delete|Slash|Backslash|Comma|Period|Semicolon|Quote|Backquote|Minus|Equal|Bracket(Left|Right))$/

describe("the shipped keymap", () => {
  it("is the sum of its parts", () => {
    expect(defaultShortcuts).toHaveLength(globalShortcuts.length + shellShortcuts.length)
  })

  // Exit criterion: a conflicting shortcut registration fails at startup. That
  // has to mean ours do not conflict.
  it("has no conflicts of its own", () => {
    const conflicts = detectConflicts(defaultShortcuts, { commandExists: () => true })

    expect(conflicts).toEqual([])
  })

  it("describes every binding by physical key, so a layout change cannot move it", () => {
    for (const registration of defaultShortcuts) {
      expect(registration.binding.key, serializeBinding(registration.binding)).toMatch(PHYSICAL_KEY)
    }
  })

  it("names every command in the dotted form", () => {
    for (const registration of defaultShortcuts) {
      expect(registration.commandId).toMatch(/^[a-z]+(\.[a-z-]+)+$/)
    }
  })

  /**
   * WCAG 2.1.4. A shortcut that is a single character with no modifier can be
   * triggered by speech input, so it must be remappable or switchable off —
   * which Settings → Keyboard provides. The list is kept deliberately short, and
   * this test is what keeps it that way.
   */
  it("uses at most one unmodified character key outside the canvas", () => {
    const characterKeys = defaultShortcuts.filter(
      (registration) =>
        registration.binding.mod !== true &&
        registration.binding.alt !== true &&
        registration.binding.ctrl !== true &&
        /^(Key[A-Z]|Digit[0-9]|Slash|Comma|Period)$/.test(registration.binding.key),
    )

    expect(characterKeys.map((registration) => serializeBinding(registration.binding))).toEqual([
      "shift+Slash",
    ])
  })

  it("only repeats bindings that are safe to repeat", () => {
    const repeating = defaultShortcuts.filter((registration) => registration.allowRepeat === true)

    // Nothing the editor ships yet repeats. Nudging will, when there is
    // something on the canvas to nudge.
    expect(repeating).toEqual([])
  })
})

describe("global shortcuts", () => {
  it("makes the palette reachable from anywhere", () => {
    expect(globalShortcuts).toContainEqual({
      commandId: "help.command-palette",
      binding: { key: "KeyK", mod: true },
      scope: "global",
    })
  })

  it("offers the shortcut reference on both ⌘/ and ?", () => {
    const bindings = globalShortcuts
      .filter((registration) => registration.commandId === "help.shortcuts")
      .map((registration) => serializeBinding(registration.binding))

    expect(bindings).toEqual(["mod+Slash", "shift+Slash"])
  })

  it("scopes everything in it to global", () => {
    for (const registration of globalShortcuts) expect(registration.scope).toBe("global")
  })
})

describe("shell shortcuts", () => {
  // None of them fire on the dashboard, where there are no panels to toggle.
  it("scopes everything in it to the studio", () => {
    for (const registration of shellShortcuts) expect(registration.scope).toBe("studio")
  })

  it("switches sidebar tabs with ⌥ and a digit, never ⌘ and a digit", () => {
    const tabs = shellShortcuts.filter((registration) =>
      registration.commandId.startsWith("view.sidebar."),
    )

    expect(tabs).toHaveLength(6)

    for (const registration of tabs) {
      expect(registration.binding.alt).toBe(true)
      expect(registration.binding.mod).toBeUndefined()
    }
  })
})

describe("the palette's own keys", () => {
  // Not registered: the palette is a combobox and handles them itself. Binding
  // them globally as well would move the highlight twice on every press.
  it("is not part of the keymap", () => {
    const registered = new Set(defaultShortcuts.map((registration) => registration.binding.key))

    for (const key of paletteKeys) {
      expect(registered.has(key.binding.key)).toBe(false)
    }
  })

  it("describes every key, so the reference sheet can show them", () => {
    expect(paletteKeys.length).toBeGreaterThan(0)

    for (const key of paletteKeys) {
      expect(key.description).not.toBe("")
      expect(key.binding.key).toMatch(PHYSICAL_KEY)
    }
  })

  it("covers navigating, running and closing", () => {
    expect(paletteKeys.map((key) => key.description)).toEqual([
      "Next result",
      "Previous result",
      "Run",
      "Run in a new context",
      "Enter a result's sub-menu",
      "Close",
    ])
  })
})
