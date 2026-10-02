import type { CheckoutSchema } from "@checkout-studio/schema"

import type { LayerRow } from "./tree"

/**
 * Reordering by keyboard.
 *
 * Drag reorder arrives in Phase 8. This is the keyboard path, which docs/
 * phases.md requires regardless — and which is the only way some users reorder
 * anything at all.
 *
 * What it produces is a `move`: a parent and an index. Not a swap, not a
 * "shift up" — the store has one operation for changing where a node lives, so
 * undo, autosave and the renderer all see one kind of change.
 *
 * Moving up or down steps through the *visible* rows, so what the user sees is
 * what moves. Pressing up at the top of a container lifts the node out to sit
 * before its parent, and pressing down past the last sibling drops it after the
 * parent — which is how a node escapes a container without the mouse.
 */

export interface Move {
  id: string
  parentId: string
  index: number
}

/** Where `id` sits now: its parent and its position among siblings. */
function positionOf(
  document: CheckoutSchema,
  id: string,
): { parentId: string; index: number } | null {
  const parentId = document.nodes[id]?.parentId

  if (parentId === null || parentId === undefined) return null

  const index = document.nodes[parentId]?.children.indexOf(id) ?? -1

  return index === -1 ? null : { parentId, index }
}

/**
 * The move for nudging `id` one step up among its siblings, or out of its
 * parent when it is already first.
 *
 * Null when there is nowhere to go: the first child of the root has no earlier
 * position and no grandparent to rise into.
 */
export function moveUp(document: CheckoutSchema, id: string): Move | null {
  const here = positionOf(document, id)

  if (here === null) return null

  if (here.index > 0) {
    const previousId = document.nodes[here.parentId]?.children[here.index - 1]
    const previous = previousId === undefined ? undefined : document.nodes[previousId]

    // Into the sibling above, if it can hold children: stepping *into* a
    // container is what the eye expects when the row above is a container's
    // last row.
    if (previous !== undefined && previous.children.length > 0) {
      return { id, parentId: previous.id, index: previous.children.length }
    }

    return { id, parentId: here.parentId, index: here.index - 1 }
  }

  const grandparent = positionOf(document, here.parentId)

  return grandparent === null
    ? null
    : { id, parentId: grandparent.parentId, index: grandparent.index }
}

/** The move for nudging `id` one step down, or out past its parent. */
export function moveDown(document: CheckoutSchema, id: string): Move | null {
  const here = positionOf(document, id)

  if (here === null) return null

  const siblings = document.nodes[here.parentId]?.children ?? []

  if (here.index < siblings.length - 1) {
    const nextId = siblings[here.index + 1]
    const next = nextId === undefined ? undefined : document.nodes[nextId]

    if (next !== undefined && next.children.length > 0) {
      return { id, parentId: next.id, index: 0 }
    }

    return { id, parentId: here.parentId, index: here.index + 1 }
  }

  const grandparent = positionOf(document, here.parentId)

  return grandparent === null
    ? null
    : { id, parentId: grandparent.parentId, index: grandparent.index + 1 }
}

/**
 * The move for making `id` a child of the sibling above it.
 *
 * The other half of reordering: up and down change order, left and right change
 * depth, which is the pair every outliner uses.
 */
export function indent(document: CheckoutSchema, id: string): Move | null {
  const here = positionOf(document, id)

  if (here === null || here.index === 0) return null

  const siblingId = document.nodes[here.parentId]?.children[here.index - 1]

  if (siblingId === undefined) return null

  return { id, parentId: siblingId, index: document.nodes[siblingId]?.children.length ?? 0 }
}

/** The move for lifting `id` out of its parent, to sit just after it. */
export function outdent(document: CheckoutSchema, id: string): Move | null {
  const here = positionOf(document, id)

  if (here === null) return null

  const grandparent = positionOf(document, here.parentId)

  return grandparent === null
    ? null
    : { id, parentId: grandparent.parentId, index: grandparent.index + 1 }
}

/**
 * The row the keyboard should land on after moving through the list.
 *
 * Skips nothing: a locked row can still be focused, because a user has to be
 * able to reach it to unlock it. Locking stops a node being *edited*, not
 * being looked at.
 */
export function rowAfter(
  rows: readonly LayerRow[],
  id: string | null,
  direction: 1 | -1,
): string | null {
  if (rows.length === 0) return null

  const index = rows.findIndex((row) => row.id === id)

  if (index === -1) return (direction === 1 ? rows[0] : rows[rows.length - 1])?.id ?? null

  const next = index + direction

  if (next < 0 || next >= rows.length) return id

  return rows[next]?.id ?? null
}
