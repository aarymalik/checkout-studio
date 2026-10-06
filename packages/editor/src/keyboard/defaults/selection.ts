import type { ShortcutRegistration } from "../types"

/**
 * Walking the tree with the keyboard.
 *
 * docs/keyboard-shortcuts.md § Selection. Every binding is in
 * `canvas.selection` — the canvas, with something selected — because every one
 * of them acts from a selected node, and because of what `Tab` means here.
 *
 * ## Taking Tab
 *
 * Inside the canvas with a node selected, `Tab` moves to the next sibling
 * rather than to the next focusable element. That is a real cost, and the
 * specification pays for it deliberately: the alternative is a canvas whose
 * nodes can only be reached with a pointer.
 *
 * It is not a trap, and the escapes are the ones § Accessibility promises:
 *
 * - `F6` and `⇧F6` always move to the next or previous region, from anywhere.
 * - `Escape` clears the selection, after which the scope is gone and `Tab`
 *   leaves the canvas.
 * - With nothing selected the scope is inactive, so `Tab` never behaved
 *   differently in the first place.
 *
 * `Tab`, `↵` and `Escape` are not character keys, so WCAG 2.1.4 does not apply
 * to them; `⌘A` is modified. All of them decline while a text field has focus,
 * so `Tab` still leaves a rename field and `↵` still commits it.
 */
export const selectionShortcuts: readonly ShortcutRegistration[] = [
  {
    commandId: "selection.all-siblings",
    binding: { key: "KeyA", mod: true },
    scope: "canvas.selection",
  },

  {
    commandId: "selection.next-sibling",
    binding: { key: "Tab" },
    scope: "canvas.selection",
  },
  {
    commandId: "selection.previous-sibling",
    binding: { key: "Tab", shift: true },
    scope: "canvas.selection",
  },

  // ↵ walks down the tree and ⇧↵ walks up it, mirroring the breadcrumb.
  { commandId: "selection.enter", binding: { key: "Enter" }, scope: "canvas.selection" },
  {
    commandId: "selection.parent",
    binding: { key: "Enter", shift: true },
    scope: "canvas.selection",
  },

  { commandId: "selection.clear", binding: { key: "Escape" }, scope: "canvas.selection" },
]
