import type { ScopeId } from "./types"

/**
 * Scopes decide which bindings are live.
 *
 * The tree is in docs/keyboard-shortcuts.md. Depth is specificity: a binding in
 * `canvas.selection` beats the same binding in `canvas`, which beats it in
 * `global`.
 */

/** Deepest first. A scope's depth is the number of dots in its name, plus its rank. */
const DEPTH: Record<ScopeId, number> = {
  global: 0,
  dashboard: 1,
  studio: 1,
  canvas: 2,
  layers: 2,
  inspector: 2,
  library: 2,
  "canvas.selection": 3,
  "canvas.text-editing": 3,
  "canvas.multi-selection": 4,
  /*
   * Deeper than every selection scope, because a keyboard drag is modal: while
   * something is in the hand, ↵ drops it rather than stepping into it and
   * Escape puts it back rather than clearing the selection. Both of those are
   * bound in `canvas.selection`, and this is how one wins without either
   * knowing about the other.
   */
  "canvas.dragging": 5,
  "overlay.dialog": 10,
  "overlay.command-palette": 10,
  "overlay.context-menu": 10,
}

export function depthOf(scope: ScopeId): number {
  return DEPTH[scope]
}

export function isOverlay(scope: ScopeId): boolean {
  return scope.startsWith("overlay.")
}

/**
 * The keys that keep working while an overlay is open.
 *
 * Everything else is swallowed. This is what makes a dialog modal in the way a
 * person expects: while it is open, ⌘D does not duplicate something behind it.
 * The allowlist is the set of keys that operate the overlay itself.
 */
const OVERLAY_ALLOWLIST = new Set([
  "Escape",
  "Tab",
  "Enter",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
])

export function allowedWhileOverlayOpen(key: string): boolean {
  return OVERLAY_ALLOWLIST.has(key)
}

/**
 * The scopes a binding may be matched against, most specific first.
 *
 * When an overlay is open the rest of the interface is excluded entirely —
 * only overlay scopes survive, and the caller consults the allowlist for the
 * handful of keys that still reach past them.
 */
export function resolveActiveScopes(active: readonly ScopeId[]): readonly ScopeId[] {
  const unique = [...new Set(active)]
  const overlays = unique.filter(isOverlay)

  const candidates = overlays.length > 0 ? overlays : unique

  return [...candidates].sort((a, b) => depthOf(b) - depthOf(a))
}

/** Whether any overlay is open, which changes how a keystroke is treated. */
export function hasOverlay(active: readonly ScopeId[]): boolean {
  return active.some(isOverlay)
}
