import type { ShortcutRegistration } from "../types"

/**
 * Moving a node with the keyboard.
 *
 * docs/keyboard-shortcuts.md § Keyboard drag and drop. `M` picks up; the arrows
 * move the drop position; `↵` drops; `Escape` puts it back.
 *
 * `M` is an unmodified character key, which WCAG 2.1.4 allows when a shortcut
 * is "active only on focus" — so it is bound in the canvas scope, where it is
 * live only while the canvas is mounted and in scope, and it joins the
 * enumerated exemptions in reserved.ts.
 *
 * Everything else is bound in `canvas.dragging`, which is deeper than
 * `canvas.selection`. That is the whole of the modality: while something is in
 * the hand `↵` drops it rather than stepping into it and `Escape` puts it back
 * rather than clearing the selection, and when nothing is held these are not
 * consulted at all. Neither binding knows about the other.
 */
export const dndShortcuts: readonly ShortcutRegistration[] = [
  { commandId: "dnd.pick-up", binding: { key: "KeyM" }, scope: "canvas" },

  { commandId: "dnd.step-up", binding: { key: "ArrowUp" }, scope: "canvas.dragging" },
  { commandId: "dnd.step-down", binding: { key: "ArrowDown" }, scope: "canvas.dragging" },
  { commandId: "dnd.step-out", binding: { key: "ArrowLeft" }, scope: "canvas.dragging" },
  { commandId: "dnd.step-in", binding: { key: "ArrowRight" }, scope: "canvas.dragging" },

  { commandId: "dnd.drop", binding: { key: "Enter" }, scope: "canvas.dragging" },
  { commandId: "dnd.cancel", binding: { key: "Escape" }, scope: "canvas.dragging" },
]
