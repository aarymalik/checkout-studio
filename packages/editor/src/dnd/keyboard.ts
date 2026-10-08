import { move as moveNode, type CheckoutSchema, type Node } from "@checkout-studio/schema"

import { indent, moveDown, moveUp, outdent } from "../layers/reorder"
import type { KeyboardDrag } from "../state/types"
import type { DropPosition } from "./resolve"
import { dropRejection, type DropRules } from "./validity"

/**
 * Dragging with the keyboard.
 *
 * docs/keyboard-shortcuts.md § Keyboard drag and drop: `M` picks a node up,
 * the arrows move the drop indicator through every valid position, `↵` drops it
 * as one history entry and `Escape` puts it back. Phase 8's exit criteria
 * require the whole of it, announced — a canvas where the only way to move
 * something is to hold a button down is a canvas some people cannot use.
 *
 * ## Held as a document, not as a plan
 *
 * Each step applies the move to a copy and keeps it. That is what makes "every
 * valid position" reachable: the next step is computed from where the node now
 * is, so repeated presses walk the tree the way repeated presses of the layers
 * panel's reorder do — and they use the same four functions, so the two cannot
 * disagree about what "up" means.
 *
 * Nothing is written to the store until the drop. The copy is thrown away on
 * cancel, which is why cancelling is not an undo: there is nothing to undo.
 */

export type DragStep = "up" | "down" | "in" | "out"

export type { KeyboardDrag } from "../state/types"

/**
 * Where a node sits now: its parent and its position among siblings.
 *
 * Null only for the root and for a node the document does not contain. A node
 * that has a parent is listed by that parent — Phase 5's exit criteria hold
 * that no sequence of operations produces a tree where it is not, and the
 * store refuses to open a document that fails the check. Asking again would
 * add a branch no test could reach.
 */
function positionOf(
  document: CheckoutSchema,
  id: string,
): { parentId: string; index: number } | null {
  const parentId = document.nodes[id]?.parentId

  if (parentId === undefined || parentId === null) return null

  return { parentId, index: (document.nodes[parentId] as Node).children.indexOf(id) }
}

/**
 * Pick a node up, or refuse to.
 *
 * Null for the root, which cannot be moved, and for a locked node — the same
 * rule the pointer drag applies, asked here before anything lifts rather than
 * after the user has moved it somewhere.
 */
export function pickUp(
  document: CheckoutSchema,
  id: string,
  rules: DropRules = {},
): KeyboardDrag | null {
  const here = positionOf(document, id)

  if (here === null) return null

  // Where it is now is a legal place for it to be, unless something about the
  // node itself forbids moving it at all.
  if (dropRejection(document, [id], here.parentId, rules) !== null) return null

  return { id, parentId: here.parentId, index: here.index, provisional: document, steps: 0 }
}

const STEPS = { up: moveUp, down: moveDown, in: indent, out: outdent } as const

/**
 * The drag one step on, or the same drag when there is nowhere to go.
 *
 * Unchanged rather than null at the ends, so a key pressed once too often is a
 * key that did nothing rather than one that dropped what was being carried.
 */
export function stepDrag(drag: KeyboardDrag, step: DragStep, rules: DropRules = {}): KeyboardDrag {
  const candidate = STEPS[step](drag.provisional, drag.id)

  if (candidate === null) return drag
  if (dropRejection(drag.provisional, [drag.id], candidate.parentId, rules) !== null) return drag

  /*
   * Accepted, because `dropRejection` has just said so.
   *
   * It calls the schema's own `moveRefusal`, which is the function `move`
   * consults before doing anything — so a refusal here would mean the two
   * disagreed, and the two are the same code. A node that moved is in its new
   * parent's children, which is what makes the position below readable.
   */
  const applied = moveNode(
    drag.provisional,
    candidate.id,
    candidate.parentId,
    candidate.index,
    rules.canHaveChildren === undefined ? {} : { canHaveChildren: rules.canHaveChildren },
  ) as { ok: true; document: CheckoutSchema }

  const landed = positionOf(applied.document, drag.id) as { parentId: string; index: number }

  return {
    id: drag.id,
    parentId: landed.parentId,
    index: landed.index,
    provisional: applied.document,
    steps: drag.steps + 1,
  }
}

/**
 * The node to draw the indicator against, and which side of it.
 *
 * Read from the provisional document, where the node is already where it would
 * land — so its neighbours there are the neighbours it would actually have.
 *
 * The first version read the real document and an index, and the two are not
 * the same index space: `move` counts positions against the children *before*
 * the node is lifted out, so at pickup the index pointed at the dragged node
 * and the answer was "before itself". Asking the provisional document instead
 * removes the question rather than correcting the arithmetic.
 *
 * Its own previous sibling is preferred to its next, because "after Hero"
 * reads as a destination and "before Box" reads as a near miss.
 */
export function indicatorTarget(
  drag: KeyboardDrag,
): { overId: string; position: DropPosition } | null {
  const siblings = drag.provisional.nodes[drag.parentId]?.children

  if (siblings === undefined) return null

  const at = siblings.indexOf(drag.id)

  if (at === -1) return null

  const previous = siblings[at - 1]

  if (previous !== undefined) return { overId: previous, position: "after" }

  const next = siblings[at + 1]

  if (next !== undefined) return { overId: next, position: "before" }

  // An only child: there is no sibling to point at, so the container is the
  // answer.
  return { overId: drag.parentId, position: "inside" }
}

/**
 * Takes the same `nameOf` as the validity rules, deliberately.
 *
 * One way to name a node across the drag layer, so a rejection and an
 * announcement cannot call the same thing two different things.
 */
export type DescribeOptions = DropRules

/**
 * What a screen reader hears at each candidate position.
 *
 * "Each candidate position is announced", per the specification, and the
 * announcement has to say the thing that changed. A position is only
 * meaningful relative to something the user knows about, so it names the
 * neighbour and the container rather than reading an index: "after Hero, in
 * Page" tells somebody where they are, and "index 2" does not.
 */
export function describeDrag(drag: KeyboardDrag, options: DescribeOptions = {}): string {
  const name = (id: string): string => {
    const node = drag.provisional.nodes[id]

    if (node === undefined) return id

    return options.nameOf?.(node) ?? node.metadata.name ?? id
  }

  const target = indicatorTarget(drag)
  const moving = name(drag.id)
  const container = name(drag.parentId)

  if (target === null) return `${moving}, nowhere to put it`
  if (target.position === "inside") return `${moving}, into ${container}, on its own`

  return `${moving}, ${target.position} ${name(target.overId)}, in ${container}`
}
