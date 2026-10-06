import type { ShortcutRegistration } from "../types"

/**
 * Undo, redo, and the clipboard.
 *
 * Scoped to `studio` rather than `canvas`: the layers panel reorders, renames,
 * locks and hides, and every one of those belongs in the same history as a
 * canvas edit. Undo that only worked over the canvas would be a trap.
 *
 * Every binding here is modified, so none of them is a character key shortcut
 * and the WCAG 2.1.4 limit does not apply.
 *
 * `⌘Z`, `⌘C`, `⌘X`, `⌘V` and `⌘D` all pass the text guard on purpose, which
 * means they reach the field rather than being swallowed — and the commands
 * decline while a field has focus, so a document undo never fires instead of a
 * text undo. See guards.ts.
 *
 * `Ctrl+Y` is Windows and Linux only in the specification. It is registered
 * unconditionally because `mod` is already Ctrl there and Meta on a Mac, so a
 * Mac user would have to press `⌃Y` to reach it — which is not Safari's
 * History, and is harmless.
 *
 * See docs/keyboard-shortcuts.md § History and § Editing.
 */
export const editShortcuts: readonly ShortcutRegistration[] = [
  { commandId: "edit.undo", binding: { key: "KeyZ", mod: true }, scope: "studio" },
  { commandId: "edit.redo", binding: { key: "KeyZ", mod: true, shift: true }, scope: "studio" },
  { commandId: "edit.redo", binding: { key: "KeyY", ctrl: true }, scope: "studio" },

  { commandId: "edit.copy", binding: { key: "KeyC", mod: true }, scope: "studio" },
  { commandId: "edit.cut", binding: { key: "KeyX", mod: true }, scope: "studio" },
  { commandId: "edit.paste", binding: { key: "KeyV", mod: true }, scope: "studio" },
  {
    commandId: "edit.paste-in-place",
    binding: { key: "KeyV", mod: true, shift: true },
    scope: "studio",
  },
  {
    commandId: "edit.paste-styles",
    binding: { key: "KeyV", mod: true, alt: true },
    scope: "studio",
  },

  { commandId: "edit.duplicate", binding: { key: "KeyD", mod: true }, scope: "studio" },
  { commandId: "edit.delete", binding: { key: "Backspace" }, scope: "canvas" },
  { commandId: "edit.delete", binding: { key: "Delete" }, scope: "canvas" },
]
