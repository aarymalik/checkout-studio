import type { ShortcutRegistration } from "../types"

/**
 * The editor frame: panels and sidebar tabs.
 *
 * Scoped to `studio` rather than `global`, so that none of them fire on the
 * dashboard, where there are no panels to toggle.
 *
 * See docs/keyboard-shortcuts.md § Panels.
 */
export const shellShortcuts: readonly ShortcutRegistration[] = [
  {
    commandId: "view.toggle-left-panel",
    binding: { key: "Backslash", mod: true },
    scope: "studio",
  },
  {
    commandId: "view.toggle-right-panel",
    binding: { key: "Backslash", mod: true, shift: true },
    scope: "studio",
  },
  // Zen mode: both panels away, all canvas.
  { commandId: "view.toggle-panels", binding: { key: "Period", mod: true }, scope: "studio" },

  // ⌥ with a digit, not ⌘ with a digit: ⌘1–⌘9 switch browser tabs.
  { commandId: "view.sidebar.components", binding: { key: "Digit1", alt: true }, scope: "studio" },
  { commandId: "view.sidebar.layers", binding: { key: "Digit2", alt: true }, scope: "studio" },
  { commandId: "view.sidebar.pages", binding: { key: "Digit3", alt: true }, scope: "studio" },
  { commandId: "view.sidebar.assets", binding: { key: "Digit4", alt: true }, scope: "studio" },
  { commandId: "view.sidebar.templates", binding: { key: "Digit5", alt: true }, scope: "studio" },
  { commandId: "view.sidebar.theme", binding: { key: "Digit6", alt: true }, scope: "studio" },
]
