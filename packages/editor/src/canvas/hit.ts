import { ancestors, traverse } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import type { Point, Rect } from "./transform"
import { contains, containsPoint, overlaps } from "./transform"

/**
 * What the pointer is over, and what a marquee caught.
 *
 * Measured boxes come from the DOM; which box *wins* is decided here, against
 * the document's structure. That separation matters: the rule for nested nodes
 * is a product decision, not a geometry one, and it has to be the same whether
 * the boxes came from a real browser or from a test.
 *
 * See docs/editor-behavior.md § Selection.
 */

/** Node id → its box in canvas space. */
export type NodeRects = ReadonlyMap<string, Rect>

/**
 * The node under a point.
 *
 * The deepest one, because that is what the user is pointing at: a button
 * inside a card inside a section is three hits, and they meant the button.
 * Depth comes from the document rather than from box containment, so a child
 * positioned outside its parent — absolute, negative margin — still resolves as
 * the child.
 *
 * The root is never returned. Clicking the page background clears the
 * selection; selecting the whole page is what the breadcrumb and ⌘A are for.
 */
export function nodeAt(document: CheckoutSchema, rects: NodeRects, point: Point): string | null {
  let best: string | null = null
  let bestDepth = -1

  traverse(document, ({ node, depth }) => {
    if (node.id === document.root) return
    if (depth < bestDepth) return

    const rect = rects.get(node.id)

    if (rect !== undefined && containsPoint(rect, point) && depth > bestDepth) {
      best = node.id
      bestDepth = depth
    }
  })

  return best
}

/**
 * The nodes a marquee caught.
 *
 * Containment first, intersection as the fallback, walking down from the root:
 *
 *   1. The marquee contains the node → take it, and stop. The outermost thing
 *      fully inside the box is what the user drew the box around.
 *   2. The marquee only touches it → look inside. If something in there was
 *      taken, done; if not, take this node, because it is the deepest thing on
 *      this branch the box reached.
 *   3. The marquee misses it → skip the whole subtree.
 *
 * Plain intersection does not work for a document like this one. Sections fill
 * the frame's width, so a small box dragged over one card inside one section
 * intersects the section, the page and everything else above it — and a rule
 * that selected those would make nested content unselectable. Containment is
 * what the user can aim precisely; the fallback is what stops a box that
 * reached nothing exactly from selecting nothing at all.
 *
 * The root is never taken, so a box over empty page background clears the
 * selection rather than selecting the page.
 */
export function nodesIn(
  document: CheckoutSchema,
  rects: NodeRects,
  marquee: Rect,
): readonly string[] {
  const caught: string[] = []

  const visit = (id: string): boolean => {
    const node = document.nodes[id]

    if (node === undefined) return false

    const rect = rects.get(id)
    const isRoot = id === document.root

    // Unmeasured: it draws nothing, so it catches nothing — but its children
    // may still have boxes, and skipping them would lose them.
    if (rect === undefined) {
      return node.children.map((child) => visit(child)).some(Boolean)
    }

    if (!overlaps(rect, marquee)) return false

    if (!isRoot && contains(marquee, rect)) {
      caught.push(id)
      return true
    }

    const inside = node.children.map((child) => visit(child)).some(Boolean)

    if (inside || isRoot) return inside

    caught.push(id)
    return true
  }

  visit(document.root)

  return caught
}

/**
 * What a click should select, given what is already selected.
 *
 * Clicking the same spot twice steps *inward*: the first click takes the
 * outermost unselected ancestor, the next takes its child, and so on down to
 * what the pointer is actually over. That is how a user reaches a section
 * without opening the layers panel, and it is why a plain hit test is not
 * enough on its own.
 */
export function selectionFor(
  document: CheckoutSchema,
  hit: string | null,
  selected: readonly string[],
): readonly string[] {
  if (hit === null) return []

  const chain = ancestors(document, hit)
    .map((node) => node.id)
    .filter((id) => id !== document.root)

  // Already inside this subtree: take one step deeper, or stay at the leaf.
  const deepest = chain.findLastIndex((id) => selected.includes(id))

  if (deepest !== -1) {
    return [chain[Math.min(deepest + 1, chain.length - 1)] as string]
  }

  // A fresh click lands on the outermost thing under the pointer, so a user
  // moving a whole section does not have to escape out of a button first.
  return [chain[0] ?? hit]
}
