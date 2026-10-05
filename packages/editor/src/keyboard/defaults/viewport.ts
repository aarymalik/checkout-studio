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
 * ## Why the device shortcuts are not here
 *
 * docs/keyboard-shortcuts.md specifies Shift+D, Shift+T and Shift+M for the
 * breakpoints. Shift and a letter is a *character key shortcut* under WCAG
 * 2.1.4: speech input can trigger it, so it has to be switchable off,
 * remappable, or active only on focus.
 *
 * This product offers remapping, which satisfies the rule — but the keymap also
 * holds itself to one unmodified character key in total, and that limit is a
 * deliberate brake rather than an oversight. The clean answer is the third
 * exemption: make them live only while the canvas has focus, in the `canvas`
 * scope. Nothing enters that scope yet, because the canvas is not mounted until
 * a component is registered.
 *
 * So the commands exist and are reachable from the toolbar and the palette, and
 * these three bindings arrive with the scope that makes them legitimate. A
 * binding that cannot fire is worse than one that is not there yet.
 *
 * See docs/keyboard-shortcuts.md § Canvas & Viewport.
 */
export const viewportShortcuts: readonly ShortcutRegistration[] = [
  { commandId: "view.zoom-in", binding: { key: "Equal", mod: true }, scope: "studio" },
  { commandId: "view.zoom-out", binding: { key: "Minus", mod: true }, scope: "studio" },
  { commandId: "view.zoom-reset", binding: { key: "Digit0", mod: true }, scope: "studio" },
]
