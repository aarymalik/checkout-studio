import { describe, expect, it } from "vitest"

import {
  defaultShortcuts,
  globalShortcuts,
  paletteShortcuts,
  shellShortcuts,
} from "../../src/keyboard/defaults"
import { detectConflicts } from "../../src/keyboard/conflicts"
import { serializeBinding } from "../../src/keyboard/normalize"

/** A KeyboardEvent.code, not a character. See docs/keyboard-shortcuts.md. */
const PHYSICAL_KEY =
  /^(Key[A-Z]|Digit[0-9]|F\d{1,2}|Arrow(Up|Down|Left|Right)|Escape|Enter|Tab|Space|Backspace|Delete|Slash|Backslash|Comma|Period|Semicolon|Quote|Backquote|Minus|Equal|Bracket(Left|Right))$/

describe("the shipped keymap", () => {
  it("is the sum of its parts", () => {
    expect(defaultShortcuts).toHaveLength(
      globalShortcuts.length + shellShortcuts.length + paletteShortcuts.length,
    )
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

    // Moving through a list. Nothing that changes the document repeats.
    expect(repeating.map((registration) => registration.commandId)).toEqual([
      "palette.next",
      "palette.previous",
    ])
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

describe("palette shortcuts", () => {
  it("scopes everything in it to the palette overlay", () => {
    for (const registration of paletteShortcuts)
      expect(registration.scope).toBe("overlay.command-palette")
  })

  it("covers navigating, running and closing", () => {
    expect(paletteShortcuts.map((registration) => registration.commandId)).toEqual([
      "palette.next",
      "palette.previous",
      "palette.run",
      "palette.run-alternate",
      "palette.close",
    ])
  })
})
