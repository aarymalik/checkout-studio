import type { CheckoutSchema, Node } from "../document/schema"

/**
 * Walking the tree.
 *
 * Depth-first and iterative. A recursive walk is shorter to read and blows the
 * stack on a deep document, and "deep" here is whatever a person nests — there
 * is no depth limit in the schema, so there cannot be one in the walk.
 */

export interface VisitContext {
  node: Node
  /** Root is 0. */
  depth: number
  /** Position among its siblings. Root is 0. */
  index: number
}

/**
 * Visit every node under `from`, in document order.
 *
 * Returning `false` from the visitor stops the walk — not just the branch. The
 * caller that wants to skip a branch can say so by not descending, but a caller
 * looking for one node should not pay for the rest of the tree.
 */
export function traverse(
  document: CheckoutSchema,
  visit: (context: VisitContext) => boolean | void,
  from: string = document.root,
): void {
  const start = document.nodes[from]

  if (start === undefined) return

  const stack: VisitContext[] = [{ node: start, depth: 0, index: 0 }]

  while (stack.length > 0) {
    const current = stack.pop() as VisitContext

    if (visit(current) === false) return

    const children = current.node.children

    // Pushed in reverse so the first child is visited first: a stack reverses
    // whatever it is given.
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = document.nodes[children[index] as string]

      if (child !== undefined) {
        stack.push({ node: child, depth: current.depth + 1, index })
      }
    }
  }
}

/** Every node under `from`, including it, in document order. */
export function collect(document: CheckoutSchema, from: string = document.root): readonly Node[] {
  const nodes: Node[] = []

  traverse(document, ({ node }) => void nodes.push(node), from)

  return nodes
}

/** Every id under `from`, including it. */
export function subtreeIds(document: CheckoutSchema, from: string): readonly string[] {
  return collect(document, from).map((node) => node.id)
}

/**
 * The chain from the root down to `id`, inclusive.
 *
 * Empty when the node does not exist or its chain is broken — a caller drawing
 * breadcrumbs should show nothing rather than a partial path presented as whole.
 */
export function ancestors(document: CheckoutSchema, id: string): readonly Node[] {
  const chain: Node[] = []
  const seen = new Set<string>()
  let current: string | null = id

  while (current !== null) {
    if (seen.has(current)) return []
    seen.add(current)

    const node: Node | undefined = document.nodes[current]

    if (node === undefined) return []

    chain.unshift(node)
    current = node.parentId
  }

  return chain
}

/** Whether `candidate` is `id` or sits beneath it. */
export function isDescendant(document: CheckoutSchema, candidate: string, id: string): boolean {
  if (candidate === id) return true

  const seen = new Set<string>()
  let current: string | null = document.nodes[candidate]?.parentId ?? null

  while (current !== null) {
    if (current === id) return true
    if (seen.has(current)) return false

    seen.add(current)
    current = document.nodes[current]?.parentId ?? null
  }

  return false
}

/** The node's siblings in order, itself included. */
export function siblings(document: CheckoutSchema, id: string): readonly string[] {
  const parentId = document.nodes[id]?.parentId

  if (parentId === undefined || parentId === null)
    return document.nodes[id] === undefined ? [] : [id]

  return document.nodes[parentId]?.children ?? []
}
