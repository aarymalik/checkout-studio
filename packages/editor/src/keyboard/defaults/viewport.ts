import type { ShortcutRegistration } from "../types"

/**
 * Zoom.
 *
 * Scoped to `studio`: there is nothing to zoom on the dashboard.
 *
 * All three shadow the browser's own page zoom, deliberately and following
 * Figma's convention — they are listed as documented exceptions in reserved.ts,
 * which is what keeps a shadowed shortcut a decision rather than an accident.
 *
 * ## The device shortcuts are in the canvas scope
 *
 * Shift and a letter is a *character key shortcut* under WCAG 2.1.4: speech
 * input can trigger it, so it has to be switchable off, remappable, or active
 * only while something has focus.
 *
 * This product offers remapping, which would satisfy the rule — but the keymap
 * also holds itself to one unmodified character key outside the canvas, and
 * that limit is a deliberate brake rather than an oversight. So these take the
 * third exemption instead: they live only while the canvas is mounted and in
 * scope, which is also when switching device means anything.
 *
 * See docs/keyboard-shortcuts.md § Canvas & Viewport.
 */
export const viewportShortcuts: readonly ShortcutRegistration[] = [
  { commandId: "view.zoom-in", binding: { key: "Equal", mod: true }, scope: "studio" },
  { commandId: "view.zoom-out", binding: { key: "Minus", mod: true }, scope: "studio" },
  { commandId: "view.zoom-reset", binding: { key: "Digit0", mod: true }, scope: "studio" },

  /*
   * Fit and fit-to-selection need the size of the canvas surface, which only a
   * mounted canvas knows — so like the device keys, they belong to the scope
   * that exists exactly when they can work.
   */
  { commandId: "view.zoom-fit", binding: { key: "Digit1", shift: true }, scope: "canvas" },
  { commandId: "view.zoom-selection", binding: { key: "Digit2", shift: true }, scope: "canvas" },

  { commandId: "view.device.desktop", binding: { key: "KeyD", shift: true }, scope: "canvas" },
  { commandId: "view.device.tablet", binding: { key: "KeyT", shift: true }, scope: "canvas" },
  { commandId: "view.device.mobile", binding: { key: "KeyM", shift: true }, scope: "canvas" },
]
