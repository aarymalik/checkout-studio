import type { ShortcutRegistration } from "../types"

/**
 * The command palette's own keys.
 *
 * These are registered rather than handled inside the component so that they
 * appear in the shortcut reference sheet like everything else — a key that only
 * the component knows about is a key nobody can look up.
 *
 * Focus trapping and the dialog's own Escape are left to the overlay primitive,
 * which already does both correctly.
 *
 * See docs/keyboard-shortcuts.md § Command Palette.
 */
export const paletteShortcuts: readonly ShortcutRegistration[] = [
  {
    commandId: "palette.next",
    binding: { key: "ArrowDown" },
    scope: "overlay.command-palette",
    allowRepeat: true,
  },
  {
    commandId: "palette.previous",
    binding: { key: "ArrowUp" },
    scope: "overlay.command-palette",
    allowRepeat: true,
  },
  { commandId: "palette.run", binding: { key: "Enter" }, scope: "overlay.command-palette" },
  {
    commandId: "palette.run-alternate",
    binding: { key: "Enter", mod: true },
    scope: "overlay.command-palette",
  },
  { commandId: "palette.close", binding: { key: "Escape" }, scope: "overlay.command-palette" },
]
