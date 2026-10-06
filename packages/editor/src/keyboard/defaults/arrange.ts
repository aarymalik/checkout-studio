import type { ShortcutRegistration } from "../types"

/**
 * Locking, hiding, and moving a node through the tree.
 *
 * docs/keyboard-shortcuts.md § Structure and § Movement. Every binding is
 * modified, so none is a character key shortcut and the WCAG 2.1.4 limit does
 * not apply.
 *
 * `⌘L` is the browser's "focus address bar", so the specification binds it
 * **only** inside the canvas with a selection — which is what `canvas.selection`
 * is: outside those conditions the browser keeps it. The rest are `studio`
 * scope, because the layers panel reorders, locks and hides as well as the
 * canvas, and a binding that worked over one and not the other would be a
 * puzzle rather than a shortcut.
 *
 * `⌘↑` and `⌘↓` are "scroll to top / bottom" on macOS and `⌘⇧H` is Safari's
 * Home; all three are listed under Documented Exceptions in the specification,
 * following Figma's conventions.
 *
 * `⌘⇧↑` and `⌘⇧↓` are the specification's "move across containers". `⌘↑` and
 * `⌘↓` already cross a boundary when there is no sibling left to pass — see
 * reorder.ts — so these are the deliberate forms: out of the container, and
 * into the one above.
 */
export const arrangeShortcuts: readonly ShortcutRegistration[] = [
  { commandId: "arrange.lock", binding: { key: "KeyL", mod: true }, scope: "canvas.selection" },
  { commandId: "arrange.hide", binding: { key: "KeyH", mod: true, shift: true }, scope: "studio" },

  { commandId: "arrange.move-up", binding: { key: "ArrowUp", mod: true }, scope: "studio" },
  { commandId: "arrange.move-down", binding: { key: "ArrowDown", mod: true }, scope: "studio" },
  {
    commandId: "arrange.move-out",
    binding: { key: "ArrowUp", mod: true, shift: true },
    scope: "studio",
  },
  {
    commandId: "arrange.move-into",
    binding: { key: "ArrowDown", mod: true, shift: true },
    scope: "studio",
  },
]
