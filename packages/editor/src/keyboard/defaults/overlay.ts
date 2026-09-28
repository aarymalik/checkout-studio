import type { KeyBinding } from "../types"

/**
 * The command palette's own keys.
 *
 * These are not registered as shortcuts, and that is deliberate. The palette is
 * a combobox: its arrows, Enter and Escape belong to it the way a native
 * select's do, and the component already handles them against the highlight it
 * owns. Binding them globally as well would move the highlight twice on every
 * press.
 *
 * They are still described here, because a key nobody can look up does not
 * exist — the shortcut reference sheet shows this table beside the registered
 * shortcuts, under the palette's own heading.
 *
 * See docs/keyboard-shortcuts.md § Command Palette.
 */
export interface ContextualKey {
  binding: KeyBinding
  description: string
}

export const paletteKeys: readonly ContextualKey[] = [
  { binding: { key: "ArrowDown" }, description: "Next result" },
  { binding: { key: "ArrowUp" }, description: "Previous result" },
  { binding: { key: "Enter" }, description: "Run" },
  { binding: { key: "Enter", mod: true }, description: "Run in a new context" },
  { binding: { key: "Tab" }, description: "Enter a result's sub-menu" },
  { binding: { key: "Escape" }, description: "Close" },
]
