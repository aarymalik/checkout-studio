import type { Move } from "./reorder"
import { ROW_HEIGHT } from "./window"
import type { LayerRow } from "./tree"

/**
 * Where a drag in the layers panel would land.
 *
 * The canvas resolves a drop against measured boxes, because the renderer
 * decides where things are. A list does not need measuring: a layers row is a
 * single line at a fixed size — `ROW_HEIGHT` is a property of the design rather
 * than a simplification of it — so the row under the pointer is one division,
 * and the panel's virtualization means most rows are not in the DOM to measure
 * anyway.
 *
 * That is also why there is no drag library here. Its collision machinery wants
 * the items mounted so it can measure them, which is the opposite of what a
 * windowed list offers, and the answer it would work out is the answer `floor`
 * gives.
 *
 * See docs/editor-behavior.md § Layers and docs/phases.md Phase 8.
 */

/**
 * How much of a row counts as its edge.
 *
 * A third each way, so every row has a usable middle for "inside" and the two
 * edges are big enough to hit on a 28px target. The canvas caps its bands in
 * pixels because its boxes vary in height by orders of magnitude; rows do not
 * vary at all, so a fraction is the whole story.
 */
const EDGE = 1 / 3

/** Where a drop sits relative to the row it was resolved against. */
export type RowDropPosition = "before" | "after" | "inside"

export interface RowDrop {
  /** The row the indicator is drawn against. */
  overId: string
  position: RowDropPosition
  /** Where the move goes. The two values `move` takes. */
  parentId: string
  index: number
}

export interface RowDropOptions {
  /** Whether a row may hold children. Omitted means yes. */
  canHaveChildren?: (row: LayerRow) => boolean
}

/** Which row a pointer is over, by arithmetic rather than by measurement. */
export function rowAt(rows: readonly LayerRow[], y: number): LayerRow | null {
  if (rows.length === 0) return null

  const index = Math.floor(y / ROW_HEIGHT)

  // Clamped rather than refused: a pointer a little past the last row means
  // "the end", which is a place, and dragging below a short list is the
  // ordinary way to reach it.
  return rows[Math.min(Math.max(index, 0), rows.length - 1)] ?? null
}

/**
 * The drop a position in the panel describes.
 *
 * Null when the list is empty or the row it landed on has no parent — the root
 * is the one row with nowhere to be beside, and "before the page" is not a
 * place.
 */
export function rowDropAt(
  rows: readonly LayerRow[],
  y: number,
  options: RowDropOptions = {},
): RowDrop | null {
  const row = rowAt(rows, y)

  if (row === null) return null

  const within = y - Math.floor(y / ROW_HEIGHT) * ROW_HEIGHT
  const accepts = options.canHaveChildren?.(row) ?? true

  /*
   * The middle of an expanded container means "inside, first".
   *
   * Appending would be the other reading, and it is the wrong one here:
   * dropping onto a container in a tree means "put it in there", and the first
   * position is the one the user can see the result of without scrolling.
   */
  if (accepts && within > ROW_HEIGHT * EDGE && within < ROW_HEIGHT * (1 - EDGE)) {
    return { overId: row.id, position: "inside", parentId: row.id, index: 0 }
  }

  if (row.parentId === null) {
    // The root. There is no before or after it, so the nearest thing the user
    // can have meant is inside it.
    return { overId: row.id, position: "inside", parentId: row.id, index: 0 }
  }

  const after = within >= ROW_HEIGHT / 2

  return {
    overId: row.id,
    position: after ? "after" : "before",
    parentId: row.parentId,
    /*
     * Counted against the children as they are, the dragged row included.
     * `move` reads the index before the node is lifted out — its own comment
     * says so — so adjusting for it here would land the drop one short.
     */
    index: after ? row.index + 1 : row.index,
  }
}

/** The move a drop describes, for handing to the store. */
export function moveForRowDrop(id: string, drop: RowDrop): Move {
  return { id, parentId: drop.parentId, index: drop.index }
}
