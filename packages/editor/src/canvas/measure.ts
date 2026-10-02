import { classFor } from "@checkout-studio/renderer"
import type { CheckoutSchema } from "@checkout-studio/schema"

import type { NodeRects } from "./hit"
import type { Rect } from "./transform"

/**
 * Where the rendered nodes actually are.
 *
 * The canvas draws the page through the renderer and then measures the result,
 * rather than computing layout itself. That is the only way the overlays can be
 * right: the box around a selected node has to be the box the browser gave it,
 * including whatever the component did with flex, text wrapping and its own
 * padding.
 *
 * It also means the overlays are independent of the content, which
 * docs/phases.md requires — they are a separate layer reading measurements, not
 * markup wrapped around every node.
 *
 * Measured in *frame space*: the origin is the frame's top-left and the units
 * are unzoomed pixels, which is the space the geometry in this folder works in.
 * A selection overlay computed once stays correct through any amount of panning.
 */

/**
 * The element the renderer drew for a node.
 *
 * Found by the class the renderer emits, which is the same function on both
 * sides — so this cannot drift from what was rendered.
 */
export function elementFor(frame: Element, nodeId: string): Element | null {
  return frame.querySelector(`.${CSS.escape(classFor(nodeId))}`)
}

/**
 * One node's box, in frame space.
 *
 * Null when the node rendered nothing — hidden, or a component that returned
 * null. A node with no box has no overlay, which is correct: there is nothing
 * on screen to outline.
 */
export function measureNode(frame: Element, nodeId: string, zoom: number): Rect | null {
  const element = elementFor(frame, nodeId)

  if (element === null) return null

  return relativeTo(frame.getBoundingClientRect(), element.getBoundingClientRect(), zoom)
}

/**
 * Several nodes' boxes, from one read of the frame.
 *
 * The frame's own rect is read once rather than per node. Each
 * `getBoundingClientRect` can force a layout, and asking for the same one two
 * thousand times is how a canvas drops frames.
 */
export function measureNodes(frame: Element, ids: Iterable<string>, zoom: number): NodeRects {
  const origin = frame.getBoundingClientRect()
  const rects = new Map<string, Rect>()

  for (const id of ids) {
    const element = elementFor(frame, id)

    if (element !== null) {
      rects.set(id, relativeTo(origin, element.getBoundingClientRect(), zoom))
    }
  }

  return rects
}

function relativeTo(origin: DOMRect, rect: DOMRect, zoom: number): Rect {
  return {
    x: (rect.left - origin.left) / zoom,
    y: (rect.top - origin.top) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
  }
}

/** How tall the page came out, for fitting and for the frame's own height. */
export function measureContentHeight(frame: Element, zoom: number): number {
  return frame.getBoundingClientRect().height / zoom
}

/**
 * Class name → node id, for resolving a click.
 *
 * A click is resolved by walking up from whatever was clicked, not by testing
 * two thousand rectangles — the DOM already knows what is on top, and "deepest
 * wins" falls out of the walk. The class is the only handle the renderer leaves
 * on the element, so the mapping is built forwards and read backwards rather
 * than parsed out of the class, which is not reversible for every possible id.
 */
export function classIndex(document: CheckoutSchema): ReadonlyMap<string, string> {
  const index = new Map<string, string>()

  for (const id of Object.keys(document.nodes)) index.set(classFor(id), id)

  return index
}

/** The node an element belongs to, looking outward from it. */
export function nodeIdAt(
  target: Element | null,
  index: ReadonlyMap<string, string>,
): string | null {
  let element: Element | null = target

  while (element !== null) {
    for (const token of element.classList) {
      const id = index.get(token)

      if (id !== undefined) return id
    }

    element = element.parentElement
  }

  return null
}
