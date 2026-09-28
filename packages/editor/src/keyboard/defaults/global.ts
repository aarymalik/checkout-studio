import type { ShortcutRegistration } from "../types"

/**
 * Bindings that work anywhere in the product.
 *
 * Declared as data so that conflict detection, the shortcut reference sheet and
 * user customization can all read them without any of the three knowing about
 * each other.
 *
 * See docs/keyboard-shortcuts.md § Global.
 */
export const globalShortcuts: readonly ShortcutRegistration[] = [
  // The universal entry point. Everything reachable in the product is reachable
  // from here, which is also why it is allowed inside text fields.
  { commandId: "help.command-palette", binding: { key: "KeyK", mod: true }, scope: "global" },

  { commandId: "help.shortcuts", binding: { key: "Slash", mod: true }, scope: "global" },

  // The bare "?" is the convention everywhere on the web. The text guard keeps
  // it from firing while somebody is typing a question mark into a field.
  { commandId: "help.shortcuts", binding: { key: "Slash", shift: true }, scope: "global" },

  // Region cycling, for people who navigate by keyboard rather than by Tab
  // count. Landmarks are named in the shell layout.
  { commandId: "navigation.next-region", binding: { key: "F6" }, scope: "global" },
  { commandId: "navigation.previous-region", binding: { key: "F6", shift: true }, scope: "global" },
]
