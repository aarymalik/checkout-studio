import type { CheckoutSchema, Node } from "@checkout-studio/schema"

import { nodeAt, type NodeRects } from "../canvas/hit"
import type { Point, Rect } from "../canvas/transform"
import type { DropRules } from "./validity"

/**
 * Where a drop would land.
 *
 * The question the whole phase turns on, because Phase 8's first exit criterion
 * is that the drop position is always shown before release. "Shown" needs an
 * answer that is one thing — a parent and an index — rather than a hint.
 *
 * Collision is the canvas's existing hit test: the deepest node under the
 * point, by document depth rather than box containment, so a child positioned
 * outside its parent still resolves as the child. What is added here is the
 * part that is about dragging rather than pointing: what is being dragged is
 * not a candidate for its own drop, and a node has three regions rather than
 * one.
 *
 * See docs/editor-behavior.md § Drag & Drop and docs/phases.md Phase 8.
 */

/** Where a drop sits relative to the node it was resolved against. */
export type DropPosition = "before" | "after" | "inside"

export interface Drop {
  /** The node the pointer resolved to, which the indicator is drawn against. */
  overId: string
  position: DropPosition
  /** Where the move actually goes. The only two values the store needs. */
  parentId: string
  index: number
}

/**
 * How much of a node's height counts as its edge.
 *
 * A fraction so that a tall section and a short button both have a usable
 * middle, and a cap so that a very tall section does not have a 200px band
 * where the user meant "inside".
 */
const EDGE_FRACTION = 0.25
const EDGE_MAXIMUM = 12

/** The height of the band at each end of a node, in canvas pixels. */
export function edgeBand(height: number): number {
  return Math.min(EDGE_MAXIMUM, Math.max(0, height) * EDGE_FRACTION)
}

/** Whether this node may hold children, per the caller's rules. */
function accepts(node: Node, rules: DropRules): boolean {
  return rules.canHaveChildren?.(node) ?? true
}

/**
 * Which of a node's three regions the point is in.
 *
 * Top band, bottom band, or the middle — and the middle only means "inside" for
 * something that can hold children. A zero-height node has no bands at all,
 * which falls out of the arithmetic rather than needing a case: the fraction of
 * zero is zero, so every point is in the middle.
 */
function regionOf(rect: Rect, point: Point, insideAllowed: boolean): DropPosition {
  const band = edgeBand(rect.height)

  if (band > 0 && point.y < rect.y + band) return "before"
  if (band > 0 && point.y > rect.y + rect.height - band) return "after"

  if (insideAllowed) return "inside"

  // No middle to speak of: a node that takes no children is either side of
  // itself, decided by its own midpoint rather than by a band.
  return point.y < rect.y + rect.height / 2 ? "before" : "after"
}

/**
 * Where among a container's children the point falls.
 *
 * Appending would be easier and would surprise: a user whose pointer is in the
 * gap above the third card means "here", not "at the end". Each child's
 * midpoint decides which side of it the point is on, so the answer is the gap
 * the pointer is actually in.
 *
 * Every child is counted, including the ones there is nothing to compare
 * against and the ones being dragged. The number returned is an index into
 * `parent.children`, so skipping any of them would return a number that does
 * not mean what it says — the first version skipped unmeasured children and
 * would have inserted before the wrong one. A child that drew nothing is
 * treated as passed: it has no position on screen to be above or below, and
 * counting it is what keeps the index aligned.
 *
 * Dragged children are counted for the same reason and compared like any other:
 * `move` reads the target index against the list as it is *before* the node is
 * lifted out — its own comment says so — and the box a dragged node still
 * occupies is where the user can see it.
 */
export function indexWithin(
  document: CheckoutSchema,
  rects: NodeRects,
  parent: Node,
  point: Point,
): number {
  let index = 0

  for (const childId of parent.children) {
    const rect = rects.get(childId)

    if (rect !== undefined && point.y < rect.y + rect.height / 2) break

    index += 1
  }

  return index
}

export interface ResolveOptions extends DropRules {
  /**
   * The nodes being dragged.
   *
   * Excluded from collision, because a node cannot be dropped relative to
   * itself: without this the dragged node is the deepest thing under the
   * pointer for the whole gesture and every drop resolves to "beside where you
   * already are". Their descendants go too — a section dragged over its own
   * card is still over itself.
   */
  dragging?: readonly string[]
}

/**
 * Every id in the dragged subtrees, which collision has to look past.
 *
 * The seen-set is not only an optimisation. A document whose `children` form a
 * loop would walk forever, and a frozen tab is a worse failure than any wrong
 * answer this function could give — the store refuses to open such a document
 * now, but this runs on every pointer move and is not the place to find out
 * that something slipped through.
 */
function ignored(document: CheckoutSchema, dragging: readonly string[]): ReadonlySet<string> {
  const ids = new Set<string>()

  const walk = (id: string): void => {
    if (ids.has(id)) return

    ids.add(id)

    for (const child of document.nodes[id]?.children ?? []) walk(child)
  }

  for (const id of dragging) walk(id)

  return ids
}

/**
 * The drop a point describes, or null when there is nowhere to put anything.
 *
 * Null rather than a guess. The root is the floor — a pointer over empty page
 * background resolves to "inside the page, at the end", which is a real answer
 * — but a point outside the frame entirely is not a drop, and inventing one
 * would be the guessing this phase exists to remove.
 */
export function resolveDrop(
  document: CheckoutSchema,
  rects: NodeRects,
  point: Point,
  options: ResolveOptions = {},
): Drop | null {
  const ignore = ignored(document, options.dragging ?? [])
  const root = document.nodes[document.root]

  if (root === undefined) return null

  const visible = new Map([...rects].filter(([id]) => !ignore.has(id)))
  const over = nodeAt(document, visible, point)

  if (over === null) {
    const frame = rects.get(document.root)

    // Over the page background, inside the frame: the page is the container.
    if (frame === undefined || !within(frame, point)) return null

    return {
      overId: document.root,
      position: "inside",
      parentId: document.root,
      index: indexWithin(document, rects, root, point),
    }
  }

  /*
   * Both present, by `nodeAt`'s contract.
   *
   * It returns a node it walked to from the root and whose box it read out of
   * the map it was given — and it was given a subset of `rects`. So neither
   * lookup can miss, and checking would add two branches no test could reach.
   */
  const node = document.nodes[over] as Node
  const rect = rects.get(over) as Rect

  const position = regionOf(rect, point, accepts(node, options))

  if (position === "inside") {
    return {
      overId: over,
      position,
      parentId: over,
      index: indexWithin(document, rects, node, point),
    }
  }

  /*
   * Reachable, therefore parented.
   *
   * `nodeAt` walks the document from its root and never returns the root
   * itself, so anything it answers with was reached through some node's
   * children and has a parent. Checking again would add a branch no test could
   * reach — the only document where it could fire is one with an orphan, and
   * an orphan is not reachable from the root for `nodeAt` to find.
   */
  const parentId = node.parentId as string

  // Present for the same reason: the node was reached through this parent's
  // children, so the parent is in the document.
  const at = (document.nodes[parentId] as Node).children.indexOf(over)

  return {
    overId: over,
    position,
    parentId,
    /*
     * Indexed against the list as it is now, dragged nodes included.
     *
     * `move` reads the target index against the children before the node is
     * lifted out — its own comment says so — so filtering them here would
     * shift every position after them by one and land the drop one short.
     */
    index: position === "before" ? at : at + 1,
  }
}

/** Whether a point is inside a rect, edges included. */
function within(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}
