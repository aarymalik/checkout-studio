import { createId, type RandomSource } from "../document/ids"
import type { CheckoutSchema, Node } from "../document/schema"
import { collect } from "./traverse"

/**
 * A detached piece of tree.
 *
 * What the clipboard holds, what duplicate produces, and what paste consumes —
 * a set of nodes with one of them named as the top. It is not a document: it
 * has no theme, no settings and no page.
 */
export interface Fragment {
  rootId: string
  nodes: Readonly<Record<string, Node>>
}

/** Lift a subtree out of a document, detached from its parent. */
export function extract(document: CheckoutSchema, id: string): Fragment | null {
  if (document.nodes[id] === undefined) return null

  const nodes: Record<string, Node> = {}

  for (const node of collect(document, id)) {
    // The top of a fragment has no parent by definition: it is going somewhere
    // else, and carrying the old parent would be a reference to a node the
    // fragment does not contain.
    nodes[node.id] = node.id === id ? { ...node, parentId: null } : { ...node }
  }

  return { rootId: id, nodes }
}

/**
 * The same shape with every id replaced.
 *
 * Both halves matter: new ids so a paste cannot collide with what is already
 * there, and rewritten references so the copy describes itself rather than the
 * original. A duplicate that regenerates ids without rewriting `children` is a
 * copy whose nodes still point at the thing it was copied from.
 */
export function regenerateIds(
  fragment: Fragment,
  taken: ReadonlySet<string> = new Set(),
  random: RandomSource = Math.random,
): Fragment {
  const claimed = new Set(taken)
  const mapping = new Map<string, string>()

  for (const id of Object.keys(fragment.nodes)) {
    const node = fragment.nodes[id] as Node
    const fresh = createId(node.type, claimed, random)

    claimed.add(fresh)
    mapping.set(id, fresh)
  }

  const nodes: Record<string, Node> = {}

  for (const [oldId, node] of Object.entries(fragment.nodes)) {
    const id = mapping.get(oldId) as string

    nodes[id] = {
      ...node,
      id,
      parentId: node.parentId === null ? null : (mapping.get(node.parentId) ?? node.parentId),
      children: node.children.map((child) => mapping.get(child) ?? child),
    }
  }

  return { rootId: mapping.get(fragment.rootId) as string, nodes }
}

/** A fresh node, ready to insert. */
export function createNode(
  type: string,
  taken: ReadonlySet<string>,
  overrides: Partial<Omit<Node, "id" | "type">> = {},
  random: RandomSource = Math.random,
): Node {
  return {
    id: createId(type, taken, random),
    type,
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
    ...overrides,
  }
}
