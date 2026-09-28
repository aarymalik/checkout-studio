import { describe, expect, it } from "vitest"

import {
  DEFAULT_KEYMAP,
  explainRebinding,
  isCharacterKey,
  normalizeKeymap,
  resolveShortcuts,
} from "../../src/keyboard/persistence"
import { globalShortcuts, shellShortcuts } from "../../src/keyboard/defaults"
import type { ShortcutRegistration } from "../../src/keyboard/types"
import { serializeBinding } from "../../src/keyboard/normalize"

const DEFAULTS: readonly ShortcutRegistration[] = [
  { commandId: "help.command-palette", binding: { key: "KeyK", mod: true }, scope: "global" },
  { commandId: "help.shortcuts", binding: { key: "Slash", shift: true }, scope: "global" },
  {
    commandId: "view.toggle-left-panel",
    binding: { key: "Backslash", mod: true },
    scope: "studio",
  },
]

describe("normalizeKeymap", () => {
  it("returns the default for anything it cannot read", () => {
    for (const value of [null, undefined, 42, "{}"]) {
      expect(normalizeKeymap(value)).toEqual(DEFAULT_KEYMAP)
    }
  })

  it("reads a keymap it recognises", () => {
    expect(
      normalizeKeymap({
        overrides: [{ commandId: "help.shortcuts", scope: "global", binding: { key: "F1" } }],
        characterKeysEnabled: false,
      }),
    ).toEqual({
      overrides: [{ commandId: "help.shortcuts", scope: "global", binding: { key: "F1" } }],
      characterKeysEnabled: false,
    })
  })

  it("treats a missing switch as on, which is how the product ships", () => {
    expect(normalizeKeymap({ overrides: [] }).characterKeysEnabled).toBe(true)
  })

  it("keeps a disabling override, which is a null binding rather than a missing one", () => {
    const keymap = normalizeKeymap({
      overrides: [{ commandId: "help.shortcuts", scope: "global", binding: null }],
    })

    expect(keymap.overrides[0]?.binding).toBeNull()
  })

  it("drops an override with no command or scope", () => {
    const keymap = normalizeKeymap({
      overrides: [{ scope: "global", binding: { key: "F1" } }, { commandId: "a.b" }, 42, null],
    })

    expect(keymap.overrides).toEqual([])
  })

  // A binding is compared by serializing it, so a stored field this version does
  // not understand would change what the binding matches.
  it("rebuilds a binding field by field rather than copying it", () => {
    const keymap = normalizeKeymap({
      overrides: [
        {
          commandId: "a.b",
          scope: "global",
          binding: { key: "KeyJ", mod: true, shift: "yes", nonsense: 1 },
        },
      ],
    })

    expect(keymap.overrides[0]?.binding).toEqual({ key: "KeyJ", mod: true })
  })

  it("treats a binding with no key as no binding at all", () => {
    const keymap = normalizeKeymap({
      overrides: [{ commandId: "a.b", scope: "global", binding: { mod: true } }],
    })

    expect(keymap.overrides[0]?.binding).toBeNull()
  })

  it("carries every modifier through", () => {
    const keymap = normalizeKeymap({
      overrides: [
        {
          commandId: "a.b",
          scope: "global",
          binding: { key: "KeyJ", mod: true, shift: true, alt: true, ctrl: true },
        },
      ],
    })

    expect(serializeBinding(keymap.overrides[0]?.binding as { key: string })).toBe(
      "mod+ctrl+alt+shift+KeyJ",
    )
  })

  it("ignores overrides that are not a list", () => {
    expect(normalizeKeymap({ overrides: "none" }).overrides).toEqual([])
  })
})

describe("isCharacterKey", () => {
  // Dictating a sentence into a page that binds "S" inserts a section.
  it("recognises a bare letter, digit or punctuation key", () => {
    expect(isCharacterKey({ key: "KeyS" })).toBe(true)
    expect(isCharacterKey({ key: "Digit1" })).toBe(true)
    expect(isCharacterKey({ key: "Slash" })).toBe(true)
  })

  it("counts Shift as bare, because speech input produces capitals", () => {
    expect(isCharacterKey({ key: "Slash", shift: true })).toBe(true)
  })

  it("does not count a modified key", () => {
    expect(isCharacterKey({ key: "KeyS", mod: true })).toBe(false)
    expect(isCharacterKey({ key: "KeyS", alt: true })).toBe(false)
    expect(isCharacterKey({ key: "KeyS", ctrl: true })).toBe(false)
  })

  it("does not count a key that types nothing", () => {
    expect(isCharacterKey({ key: "Escape" })).toBe(false)
    expect(isCharacterKey({ key: "F6" })).toBe(false)
    expect(isCharacterKey({ key: "ArrowUp" })).toBe(false)
  })
})

describe("resolveShortcuts", () => {
  it("ships the defaults when nothing has been changed", () => {
    expect(resolveShortcuts(DEFAULTS, DEFAULT_KEYMAP)).toEqual(DEFAULTS)
  })

  it("replaces a binding that was remapped", () => {
    const resolved = resolveShortcuts(DEFAULTS, {
      ...DEFAULT_KEYMAP,
      overrides: [{ commandId: "help.shortcuts", scope: "global", binding: { key: "F1" } }],
    })

    expect(resolved.find((entry) => entry.commandId === "help.shortcuts")?.binding).toEqual({
      key: "F1",
    })
  })

  it("removes a shortcut that was switched off", () => {
    const resolved = resolveShortcuts(DEFAULTS, {
      ...DEFAULT_KEYMAP,
      overrides: [{ commandId: "help.shortcuts", scope: "global", binding: null }],
    })

    expect(resolved.map((entry) => entry.commandId)).not.toContain("help.shortcuts")
  })

  it("only applies an override in the scope it names", () => {
    const resolved = resolveShortcuts(DEFAULTS, {
      ...DEFAULT_KEYMAP,
      overrides: [{ commandId: "help.shortcuts", scope: "studio", binding: { key: "F1" } }],
    })

    expect(resolved.find((entry) => entry.commandId === "help.shortcuts")?.binding).toEqual({
      key: "Slash",
      shift: true,
    })
  })

  // Settings refuses these, so a stored one can only mean the rules tightened.
  it("ignores an override that names a reserved key", () => {
    const resolved = resolveShortcuts(DEFAULTS, {
      ...DEFAULT_KEYMAP,
      overrides: [
        { commandId: "help.shortcuts", scope: "global", binding: { key: "KeyW", mod: true } },
      ],
    })

    expect(resolved.find((entry) => entry.commandId === "help.shortcuts")?.binding).toEqual({
      key: "Slash",
      shift: true,
    })
  })

  describe("with character keys switched off", () => {
    it("drops every bare character shortcut", () => {
      const resolved = resolveShortcuts(DEFAULTS, {
        ...DEFAULT_KEYMAP,
        characterKeysEnabled: false,
      })

      expect(resolved.map((entry) => entry.commandId)).toEqual([
        "help.command-palette",
        "view.toggle-left-panel",
      ])
    })

    it("keeps everything the product ships except the one bare key", () => {
      const shipped = [...globalShortcuts, ...shellShortcuts]
      const resolved = resolveShortcuts(shipped, {
        ...DEFAULT_KEYMAP,
        characterKeysEnabled: false,
      })

      expect(resolved).toHaveLength(shipped.length - 1)
    })

    it("drops an override onto a character key too", () => {
      const resolved = resolveShortcuts(DEFAULTS, {
        overrides: [
          { commandId: "help.command-palette", scope: "global", binding: { key: "KeyP" } },
        ],
        characterKeysEnabled: false,
      })

      expect(resolved.map((entry) => entry.commandId)).not.toContain("help.command-palette")
    })
  })
})

describe("resolveShortcuts with a command bound twice", () => {
  // The shortcut reference ships as ⌘/ and also plain ?, because both are
  // conventions. One override replaces both.
  const TWICE: readonly ShortcutRegistration[] = [
    { commandId: "help.shortcuts", binding: { key: "Slash", mod: true }, scope: "global" },
    { commandId: "help.shortcuts", binding: { key: "Slash", shift: true }, scope: "global" },
  ]

  it("keeps both spellings when nothing was changed", () => {
    expect(resolveShortcuts(TWICE, DEFAULT_KEYMAP)).toHaveLength(2)
  })

  // Applying the override to each would register one key twice, which conflict
  // detection would rightly call ambiguous.
  it("collapses to the one key somebody chose", () => {
    const resolved = resolveShortcuts(TWICE, {
      ...DEFAULT_KEYMAP,
      overrides: [{ commandId: "help.shortcuts", scope: "global", binding: { key: "F1" } }],
    })

    expect(resolved).toEqual([
      { commandId: "help.shortcuts", binding: { key: "F1" }, scope: "global" },
    ])
  })

  it("removes both when the shortcut is switched off", () => {
    const resolved = resolveShortcuts(TWICE, {
      ...DEFAULT_KEYMAP,
      overrides: [{ commandId: "help.shortcuts", scope: "global", binding: null }],
    })

    expect(resolved).toEqual([])
  })

  it("keeps both when the override is unusable", () => {
    const resolved = resolveShortcuts(TWICE, {
      ...DEFAULT_KEYMAP,
      overrides: [
        { commandId: "help.shortcuts", scope: "global", binding: { key: "KeyW", mod: true } },
      ],
    })

    expect(resolved).toHaveLength(2)
  })
})

describe("explainRebinding", () => {
  it("accepts a free key", () => {
    expect(explainRebinding({ key: "F1" }, "global", DEFAULTS, "help.shortcuts")).toBeNull()
  })

  it("refuses a reserved key, with a reason", () => {
    expect(
      explainRebinding({ key: "KeyW", mod: true }, "global", DEFAULTS, "help.shortcuts"),
    ).toContain("operating system")
  })

  it("names the incumbent when the key is taken", () => {
    expect(
      explainRebinding({ key: "KeyK", mod: true }, "global", DEFAULTS, "help.shortcuts"),
    ).toContain("help.command-palette")
  })

  it("does not mind a command keeping its own key", () => {
    expect(
      explainRebinding({ key: "KeyK", mod: true }, "global", DEFAULTS, "help.command-palette"),
    ).toBeNull()
  })

  // The same key in two scopes is the whole point of scopes.
  it("does not mind the same key in another scope", () => {
    expect(
      explainRebinding({ key: "KeyK", mod: true }, "studio", DEFAULTS, "view.toggle-left-panel"),
    ).toBeNull()
  })
})
