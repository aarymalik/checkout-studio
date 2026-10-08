import { describe, expect, it } from "vitest"

import {
  arrangeShortcuts,
  defaultShortcuts,
  globalShortcuts,
  editShortcuts,
  paletteKeys,
  dndShortcuts,
  selectionShortcuts,
  shellShortcuts,
  viewportShortcuts,
} from "../../src/keyboard/defaults"
import { detectConflicts } from "../../src/keyboard/conflicts"
import { KeymapRegistry } from "../../src/keyboard/registry"
import { serializeBinding } from "../../src/keyboard/normalize"

/** A KeyboardEvent.code, not a character. See docs/keyboard-shortcuts.md. */
const PHYSICAL_KEY =
  /^(Key[A-Z]|Digit[0-9]|F\d{1,2}|Arrow(Up|Down|Left|Right)|Escape|Enter|Tab|Space|Backspace|Delete|Slash|Backslash|Comma|Period|Semicolon|Quote|Backquote|Minus|Equal|Bracket(Left|Right))$/

describe("the shipped keymap", () => {
  it("is the sum of its parts", () => {
    expect(defaultShortcuts).toHaveLength(
      globalShortcuts.length +
        shellShortcuts.length +
        viewportShortcuts.length +
        editShortcuts.length +
        arrangeShortcuts.length +
        selectionShortcuts.length +
        dndShortcuts.length,
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
   * triggered by speech input, so it must be switchable off, remappable, or
   * active only while a component has focus.
   *
   * Settings → Keyboard provides the first two for everything. This test is
   * about the third, and about restraint: outside the canvas the list is kept to
   * one, and this is what keeps it that way.
   */
  const isCharacterKey = (registration: (typeof defaultShortcuts)[number]): boolean =>
    registration.binding.mod !== true &&
    registration.binding.alt !== true &&
    registration.binding.ctrl !== true &&
    /^(Key[A-Z]|Digit[0-9]|Slash|Comma|Period)$/.test(registration.binding.key)

  it("uses at most one unmodified character key outside the canvas", () => {
    const characterKeys = defaultShortcuts
      .filter((registration) => registration.scope !== "canvas")
      .filter(isCharacterKey)

    expect(characterKeys.map((registration) => serializeBinding(registration.binding))).toEqual([
      "shift+Slash",
    ])
  })

  /**
   * The canvas is the exemption, and only on those terms.
   *
   * A character key in the canvas scope is live only while the canvas is
   * mounted and in scope, which is 2.1.4's "active only on focus". A character
   * key that claimed the exemption while being registered somewhere broader
   * would not have it.
   */
  it("keeps every character key in the canvas scope to the canvas", () => {
    const exempt = defaultShortcuts.filter(
      (registration) => isCharacterKey(registration) && registration.scope === "canvas",
    )

    /*
     * Enumerated rather than counted, so adding one means saying which.
     *
     * Three devices and two zoom targets, each of which needs the canvas:
     * switching device is meaningless without a frame to switch, and both zoom
     * targets need the size of the surface.
     *
     * And `M`, which picks a node up for moving by keyboard. It is the one
     * unmodified letter among them, and it earns the exemption the same way:
     * live only while the canvas is in scope, and the command declines unless
     * something is selected and nothing is already in the hand.
     */
    expect(exempt.map((registration) => serializeBinding(registration.binding)).sort()).toEqual([
      "KeyM",
      "shift+Digit1",
      "shift+Digit2",
      "shift+KeyD",
      "shift+KeyM",
      "shift+KeyT",
    ])

    for (const registration of exempt) {
      expect(registration.scope).toBe("canvas")
    }
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
  /*
   * The palette is a combobox and handles its own keys. What must be true is
   * that nothing else answers them while it is open, which this asserts twice
   * over — once about the keymap and once about the thing that enforces it.
   *
   * It used to assert that no palette key appeared in the keymap at all, by
   * comparing `binding.key` and ignoring modifiers. Both halves of that were
   * too strong. Ignoring modifiers made ⌘↑ look like ↑, so the palette's bare
   * arrows forbade the modified arrows docs/keyboard-shortcuts.md § Movement
   * asks for. And forbidding the key everywhere forbade `Tab`, `↵` and
   * `Escape` in `canvas.selection`, which § Selection requires — a scoped
   * binding is not a global one, and the comment's own reason was that binding
   * them *globally* would move the highlight twice.
   */
  it("is not registered in any overlay scope, where it would compete", () => {
    const overlay = defaultShortcuts.filter((registration) =>
      registration.scope.startsWith("overlay."),
    )
    const strokes = new Set(overlay.map((registration) => serializeBinding(registration.binding)))

    for (const key of paletteKeys) {
      expect(strokes.has(serializeBinding(key.binding)), key.description).toBe(false)
    }
  })

  it("reaches nothing underneath while the palette is open", () => {
    const registry = new KeymapRegistry({
      get: () => ({
        id: "selection.next-sibling",
        title: "Select the next sibling",
        category: "selection",
        isAvailable: () => true,
        run: () => undefined,
        mutates: false,
      }),
      has: () => true,
    } as never)

    registry.registerAll(defaultShortcuts)

    /*
     * `Tab` is bound in `canvas.selection`, and the canvas is still there
     * underneath an open palette. What keeps the two apart is
     * `resolveActiveScopes`, which drops every non-overlay scope while an
     * overlay is open — so this is the assertion that matters, rather than the
     * absence of a binding.
     */
    const resolution = registry.resolve({ key: "Tab" }, ["canvas", "canvas.selection"], {
      scopes: ["canvas", "canvas.selection"],
      selectionCount: 1,
      isEditingText: false,
      isDirty: false,
    })

    expect("match" in resolution).toBe(true)

    const behind = registry.resolve(
      { key: "Tab" },
      ["canvas", "canvas.selection", "overlay.command-palette"],
      {
        scopes: ["canvas", "canvas.selection", "overlay.command-palette"],
        selectionCount: 1,
        isEditingText: false,
        isDirty: false,
      },
    )

    // "unbound" rather than "unavailable": the binding was not even
    // considered, because the scope it lives in was excluded.
    expect(behind).toEqual({ miss: "unbound" })
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
