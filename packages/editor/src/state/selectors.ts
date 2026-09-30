import {
  ancestors,
  collect,
  type Breakpoint,
  type CheckoutSchema,
  type Node,
  type StyleProperties,
  type StyleState,
} from "@checkout-studio/schema"

import type { BuilderState } from "./types"

/**
 * Derived state.
 *
 * Computed, never stored. A breadcrumb trail kept alongside the selection is a
 * breadcrumb trail that can disagree with it, and the disagreement always shows
 * up as a bug somewhere else.
 *
 * Every selector here takes the smallest slice it can and returns something
 * stable for an unchanged input, so that updating one node does not invalidate
 * a subscription that has nothing to do with it.
 *
 * See docs/state-management.md § Derived State.
 */

export function selectedIds(state: BuilderState): readonly string[] {
  return state.selection.ids
}

/** The node the inspector shows: the first of the selection. */
export function primarySelection(state: BuilderState): Node | null {
  const id = state.selection.ids[0]

  return id === undefined ? null : (state.document.nodes[id] ?? null)
}

export function selectedNodes(state: BuilderState): readonly Node[] {
  return state.selection.ids
    .map((id) => state.document.nodes[id])
    .filter((node): node is Node => node !== undefined)
}

/** The chain from the root to the primary selection, for breadcrumbs. */
export function breadcrumbs(state: BuilderState): readonly Node[] {
  const id = state.selection.ids[0]

  return id === undefined ? [] : ancestors(state.document, id)
}

export function nodeById(state: BuilderState, id: string): Node | null {
  return state.document.nodes[id] ?? null
}

export function childrenOf(state: BuilderState, id: string): readonly Node[] {
  return (state.document.nodes[id]?.children ?? [])
    .map((child) => state.document.nodes[child])
    .filter((node): node is Node => node !== undefined)
}

/**
 * The styles in effect for a node at a breakpoint and state.
 *
 * Two cascades, in this order: breakpoints widest-first, then `base` before the
 * specific state. Only overrides are stored, so this is where a value written
 * on desktop becomes the value mobile uses.
 *
 * See docs/schema.md § Responsive System.
 */
export function resolvedStyles(
  node: Node,
  breakpoint: Breakpoint,
  state: StyleState = "base",
): StyleProperties {
  const order: Breakpoint[] =
    breakpoint === "mobile"
      ? ["desktop", "tablet", "mobile"]
      : breakpoint === "tablet"
        ? ["desktop", "tablet"]
        : ["desktop"]

  let resolved: StyleProperties = {}

  for (const step of order) {
    resolved = { ...resolved, ...node.styles[step]?.base }
  }

  if (state !== "base") {
    for (const step of order) {
      resolved = { ...resolved, ...node.styles[step]?.[state] }
    }
  }

  return resolved
}

/** Whether a node, or anything above it, is hidden. */
export function isHidden(document: CheckoutSchema, id: string): boolean {
  return ancestors(document, id).some((node) => node.visibility.hidden)
}

/** Whether a node, or anything above it, is locked. */
export function isLocked(document: CheckoutSchema, id: string): boolean {
  return ancestors(document, id).some((node) => node.metadata.locked)
}

/** Every asset the page references, derived by walking it. Never stored. */
export function usedAssets(document: CheckoutSchema): readonly string[] {
  const found = new Set<string>()

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }

    if (value === null || typeof value !== "object") return

    const record = value as Record<string, unknown>
    const reference = record["$asset"]

    if (typeof reference === "string") {
      found.add(reference)
      return
    }

    for (const item of Object.values(record)) walk(item)
  }

  for (const node of collect(document)) walk(node.props)

  const settings = document.settings

  if (settings.favicon !== undefined) found.add(settings.favicon.$asset)
  if (settings.seo?.image !== undefined) found.add(settings.seo.image.$asset)

  return [...found]
}

export function canUndo(state: BuilderState): boolean {
  return state.history.past.length > 0
}

export function canRedo(state: BuilderState): boolean {
  return state.history.future.length > 0
}

/** Whether anything is unsaved. Drives the status bar and the leave prompt. */
export function isDirty(state: BuilderState): boolean {
  return state.persistence.status !== "saved"
}
