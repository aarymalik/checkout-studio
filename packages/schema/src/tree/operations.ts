import type { RandomSource } from "../document/ids"
import type { CheckoutSchema, Node } from "../document/schema"
import { extract, regenerateIds, type Fragment } from "./fragment"
import { collect, isDescendant, subtreeIds } from "./traverse"

/**
 * The tree operations.
 *
 * Every one is pure: it returns a new document and never touches the one it was
 * given. That is not a stylistic preference — history stores the documents these
 * return, and a mutation would rewrite the past as well as the present.
 *
 * Every one either succeeds or explains itself. An operation that silently does
 * nothing when asked to move a node into its own child is an operation whose
 * caller has no idea the tree is now wrong.
 *
 * See docs/schema.md and docs/state-management.md § Node Operations.
 */

export type TreeErrorCode =
  | "missing-node"
  | "missing-parent"
  | "rejects-children"
  | "cycle"
  | "root-immovable"
  | "id-collision"
  | "empty-selection"
  | "not-siblings"
  /** The document breaks a structural invariant, so it cannot be built on. */
  | "document-unreadable"

export interface TreeFailure {
  ok: false
  code: TreeErrorCode
  message: string
  nodeIds: readonly string[]
}

export type TreeResult = { ok: true; document: CheckoutSchema } | TreeFailure

/** Like a `TreeResult`, and says what the copy is called. */
export type DuplicateResult = { ok: true; document: CheckoutSchema; newId: string } | TreeFailure

export interface TreeOptions {
  /**
   * Whether a node may hold children.
   *
   * The engine has no opinion — a heading rejects children and a section does
   * not, and both facts belong to the component library. Omitted means "yes",
   * which is the only answer an engine that knows nothing about components can
   * honestly give.
   */
  canHaveChildren?: (node: Node) => boolean
  random?: RandomSource
}

function fail(code: TreeErrorCode, message: string, nodeIds: readonly string[]): TreeFailure {
  return { ok: false, code, message, nodeIds }
}

/** A position clamped into a list, so "past the end" means "at the end". */
function clamp(index: number | undefined, length: number): number {
  if (index === undefined || Number.isNaN(index)) return length

  return Math.max(0, Math.min(Math.trunc(index), length))
}

function accepts(node: Node, options: TreeOptions): boolean {
  return options.canHaveChildren?.(node) ?? true
}

/**
 * A node list with one entry replaced, leaving the original alone.
 *
 * The caller has already established that the node is there — every operation
 * checks before it changes anything — so this does not check again.
 */
function withNode(
  nodes: CheckoutSchema["nodes"],
  id: string,
  change: (node: Node) => Node,
): CheckoutSchema["nodes"] {
  return { ...nodes, [id]: change(nodes[id] as Node) }
}

/**
 * Put a detached fragment under a parent.
 *
 * The fragment's ids are used as given. Regenerate them first when the source
 * might already be in the document — duplicate and paste both do.
 */
export function insert(
  document: CheckoutSchema,
  fragment: Fragment,
  parentId: string,
  index?: number,
  options: TreeOptions = {},
): TreeResult {
  const parent = document.nodes[parentId]

  if (parent === undefined) {
    return fail("missing-parent", `There is no node "${parentId}" to insert into.`, [parentId])
  }

  if (!accepts(parent, options)) {
    return fail("rejects-children", `"${parentId}" does not take children.`, [parentId])
  }

  const collisions = Object.keys(fragment.nodes).filter((id) => document.nodes[id] !== undefined)

  if (collisions.length > 0) {
    return fail(
      "id-collision",
      `Already in the document: ${collisions.join(", ")}. Regenerate the fragment's ids first.`,
      collisions,
    )
  }

  const at = clamp(index, parent.children.length)
  const children = [...parent.children]
  children.splice(at, 0, fragment.rootId)

  return {
    ok: true,
    document: {
      ...document,
      nodes: {
        ...document.nodes,
        ...fragment.nodes,
        [fragment.rootId]: { ...(fragment.nodes[fragment.rootId] as Node), parentId },
        [parentId]: { ...parent, children },
      },
    },
  }
}

/**
 * Move a node somewhere else in the same document.
 *
 * Moving a node into its own descendant would detach that whole branch from the
 * root and make both unreachable, so it is refused rather than performed.
 */
export function move(
  document: CheckoutSchema,
  id: string,
  parentId: string,
  index?: number,
  options: TreeOptions = {},
): TreeResult {
  const node = document.nodes[id]

  if (node === undefined) return fail("missing-node", `There is no node "${id}".`, [id])
  if (id === document.root) return fail("root-immovable", "The root cannot be moved.", [id])

  const parent = document.nodes[parentId]

  if (parent === undefined) {
    return fail("missing-parent", `There is no node "${parentId}" to move into.`, [parentId])
  }

  if (!accepts(parent, options)) {
    return fail("rejects-children", `"${parentId}" does not take children.`, [parentId])
  }

  if (isDescendant(document, parentId, id)) {
    return fail("cycle", `"${parentId}" is inside "${id}", so it cannot also contain it.`, [
      id,
      parentId,
    ])
  }

  const from = node.parentId
  const sameParent = from === parentId

  // Within one parent, the target index is read against the list as it looks
  // now — before the node is lifted out. Removing first would shift every
  // position after it by one and move the node one short of where it was aimed.
  const current = sameParent ? parent.children.indexOf(id) : -1
  const target = clamp(index, sameParent ? parent.children.length - 1 : parent.children.length)

  if (sameParent && current === target) return { ok: true, document }

  let nodes = document.nodes

  // Null for a node that is not the root and has no parent either: a document
  // in that state is invalid, and this is reached before anything has
  // validated it. There is simply nothing to detach it from.
  if (from !== null) {
    nodes = withNode(nodes, from, (previous) => ({
      ...previous,
      children: previous.children.filter((child) => child !== id),
    }))
  }

  nodes = withNode(nodes, parentId, (next) => {
    const children = [...next.children]
    children.splice(clamp(target, children.length), 0, id)

    return { ...next, children }
  })

  nodes = withNode(nodes, id, (moved) => ({ ...moved, parentId }))

  return { ok: true, document: { ...document, nodes } }
}

/**
 * Delete a node and everything under it.
 *
 * The whole subtree goes. Removing only the node would leave its children
 * pointing at something that no longer exists — reachable from nothing, visible
 * nowhere, and still counted by every walk of the document.
 */
export function remove(document: CheckoutSchema, id: string): TreeResult {
  const node = document.nodes[id]

  if (node === undefined) return fail("missing-node", `There is no node "${id}".`, [id])

  if (id === document.root) {
    return fail("root-immovable", "The root cannot be removed; a page always has one.", [id])
  }

  const doomed = new Set(subtreeIds(document, id))
  const nodes: CheckoutSchema["nodes"] = {}

  for (const [key, value] of Object.entries(document.nodes)) {
    if (doomed.has(key)) continue

    nodes[key] =
      key === node.parentId
        ? { ...value, children: value.children.filter((child) => child !== id) }
        : value
  }

  return { ok: true, document: { ...document, nodes } }
}

/**
 * Copy a subtree in beside the original.
 *
 * Every id in the copy is new and every reference within it points at the copy,
 * so the two are independent from the moment they exist.
 */
export function duplicate(
  document: CheckoutSchema,
  id: string,
  options: TreeOptions = {},
): DuplicateResult {
  const node = document.nodes[id]

  if (node === undefined) return fail("missing-node", `There is no node "${id}".`, [id])

  if (node.parentId === null) {
    return fail("root-immovable", "The root cannot be duplicated; a page has one.", [id])
  }

  const fragment = extract(document, id) as Fragment
  const copy = regenerateIds(fragment, new Set(Object.keys(document.nodes)), options.random)
  const parent = document.nodes[node.parentId] as Node
  const after = parent.children.indexOf(id) + 1

  const result = insert(document, copy, node.parentId, after, options)

  return result.ok ? { ok: true, document: result.document, newId: copy.rootId } : result
}

/**
 * Put a new node around a contiguous run of siblings.
 *
 * Contiguous because a wrapper around the first and third of three children
 * would have to move the second, and silently reordering somebody's page is a
 * worse answer than declining.
 */
export function wrap(
  document: CheckoutSchema,
  ids: readonly string[],
  wrapper: Node,
  options: TreeOptions = {},
): TreeResult {
  if (ids.length === 0) return fail("empty-selection", "Nothing was given to wrap.", [])

  const missing = ids.filter((id) => document.nodes[id] === undefined)

  if (missing.length > 0) {
    return fail("missing-node", `No such node(s): ${missing.join(", ")}.`, missing)
  }

  if (ids.includes(document.root)) {
    return fail("root-immovable", "The root cannot be wrapped.", [document.root])
  }

  if (document.nodes[wrapper.id] !== undefined) {
    return fail("id-collision", `"${wrapper.id}" is already in the document.`, [wrapper.id])
  }

  // The wrapper is about to become a parent. A heading cannot be one, and
  // wrapping a section in it would produce a tree validation rejects.
  if (!accepts(wrapper, options)) {
    return fail("rejects-children", `"${wrapper.type}" does not take children.`, [wrapper.id])
  }

  const parentId = (document.nodes[ids[0] as string] as Node).parentId as string
  const parent = document.nodes[parentId] as Node

  if (!ids.every((id) => (document.nodes[id] as Node).parentId === parentId)) {
    return fail("not-siblings", "Only siblings can be wrapped together.", ids)
  }

  const positions = ids.map((id) => parent.children.indexOf(id)).sort((a, b) => a - b)
  const first = positions[0] as number
  const contiguous = positions.every((position, offset) => position === first + offset)

  if (!contiguous) {
    return fail("not-siblings", "Only a contiguous run of siblings can be wrapped.", ids)
  }

  // In sibling order, not the order they were selected in: a wrapper that
  // reordered its contents would be a wrapper that changed the page.
  const ordered = positions.map((position) => parent.children[position] as string)

  const children = [...parent.children]
  children.splice(first, ordered.length, wrapper.id)

  const nodes: CheckoutSchema["nodes"] = {
    ...document.nodes,
    [parentId]: { ...parent, children },
    [wrapper.id]: { ...wrapper, parentId, children: ordered },
  }

  for (const id of ordered) {
    nodes[id] = { ...(nodes[id] as Node), parentId: wrapper.id }
  }

  return { ok: true, document: { ...document, nodes } }
}

/** Remove a node, promoting its children into its place in order. */
export function unwrap(document: CheckoutSchema, id: string): TreeResult {
  const node = document.nodes[id]

  if (node === undefined) return fail("missing-node", `There is no node "${id}".`, [id])

  if (node.parentId === null) {
    return fail("root-immovable", "The root cannot be unwrapped; its children need a parent.", [id])
  }

  const parent = document.nodes[node.parentId] as Node
  const at = parent.children.indexOf(id)

  const children = [...parent.children]
  children.splice(at, 1, ...node.children)

  const nodes: CheckoutSchema["nodes"] = { ...document.nodes, [parent.id]: { ...parent, children } }
  delete nodes[id]

  for (const child of node.children) {
    nodes[child] = { ...(nodes[child] as Node), parentId: parent.id }
  }

  return { ok: true, document: { ...document, nodes } }
}

/** Replace a node's fields, leaving its place in the tree alone. */
export function update(
  document: CheckoutSchema,
  id: string,
  change: (node: Node) => Node,
): TreeResult {
  const node = document.nodes[id]

  if (node === undefined) return fail("missing-node", `There is no node "${id}".`, [id])

  const next = change(node)

  return {
    ok: true,
    document: {
      ...document,
      // Structure is the tree's to decide, not an updater's: a props edit that
      // rewrote `children` would corrupt the document through a door meant for
      // styling.
      nodes: {
        ...document.nodes,
        [id]: { ...next, id: node.id, parentId: node.parentId, children: node.children },
      },
    },
  }
}

/** Every node in the document, in document order. Re-exported for convenience. */
export { collect }
