import type { CheckoutSchema, PropValue } from "../document/schema"
import { traverse } from "./traverse"
import { regenerateIds } from "./fragment"
import type { Fragment } from "./fragment"
import { insert, remove } from "./operations"
import type { TreeOptions, TreeResult } from "./operations"
import type { Node } from "../document/schema"
import { node as nodeSchema, nodeId } from "../document/schema"
import { z } from "zod"

/**
 * Symbols, from the page's side.
 *
 * docs/schema.md § Symbols: a symbol definition is a *project-level* record
 * and never part of a page. A page places one with an instance node, and the
 * renderer expands it at render time. So nothing about the page schema
 * changes to support symbols — an instance is a node with a type and two
 * props, which the schema already allows — and what is needed here is the
 * two operations that treat it as more than an opaque node.
 *
 * Keeping the definitions out of the page is what makes "editing a symbol
 * changes every instance" true by construction rather than by a fan-out
 * nobody can be sure finished.
 */

/**
 * The type an instance node carries.
 *
 * In the schema rather than in a plugin, like `ROOT_TYPE`, because the
 * schema is where the shape of a page is decided and this is part of it. The
 * *rendering* of one is a plugin's business; its place in a document is not.
 */
export const SYMBOL_INSTANCE_TYPE = "core.symbol-instance"

function symbolIdOf(props: Readonly<Record<string, PropValue>>): string | null {
  const symbolId = props["symbolId"]

  return typeof symbolId === "string" && symbolId !== "" ? symbolId : null
}

/**
 * The symbols a page places, each once.
 *
 * The third of the reference walks, beside assets and theme tokens, and it
 * exists for the same reason: exporting a page has to carry the definitions
 * it depends on, and nothing can work out which those are by looking at the
 * definitions.
 *
 * An instance naming no symbol contributes nothing rather than failing. A
 * node is not required to be sensible for a document to be readable — that
 * is a validation question — and a walk that threw would make an export
 * impossible instead of incomplete.
 */
export function symbolReferences(document: CheckoutSchema): ReadonlySet<string> {
  const found = new Set<string>()

  traverse(document, ({ node }) => {
    if (node.type !== SYMBOL_INSTANCE_TYPE) return

    const symbolId = symbolIdOf(node.props)

    if (symbolId !== null) found.add(symbolId)
  })

  return found
}

/**
 * Replaces an instance with a copy of what it was pointing at.
 *
 * "Detaching copies the symbol's subtree into the page and removes the
 * instance." After it, the page holds ordinary nodes that no longer change
 * when the symbol does — which is the whole of what detaching means, and
 * why it cannot be undone by re-attaching.
 *
 * The copy gets fresh ids before it is inserted, because the same symbol may
 * already be detached elsewhere on the page and two copies cannot share
 * them. `insert` refuses a collision rather than silently overwriting, so
 * this would be a refusal rather than a corruption either way — but a
 * refusal is not what somebody clicking detach wants.
 *
 * In at the instance's own position, then the instance out. A detached
 * footer appears where the footer was.
 */
export function detachSymbol(
  document: CheckoutSchema,
  instanceId: string,
  /** The symbol's subtree, as its definition holds it. */
  definition: Fragment,
  options: TreeOptions = {},
): TreeResult {
  const instance = document.nodes[instanceId]

  if (instance === undefined) {
    return {
      ok: false,
      code: "missing-node",
      message: `There is no node "${instanceId}" to detach.`,
      nodeIds: [instanceId],
    }
  }

  if (instance.parentId === null) {
    /*
     * A page's root is a page, not an instance. One here would mean a
     * document that should not have validated, and replacing it would mean
     * deciding what the new root is — which is a question with no answer
     * rather than a case to handle.
     */
    return {
      ok: false,
      code: "root-immovable",
      message: "A page's root cannot be a symbol instance.",
      nodeIds: [instanceId],
    }
  }

  const parent = document.nodes[instance.parentId]

  if (parent === undefined) {
    return {
      ok: false,
      code: "missing-parent",
      message: `"${instanceId}" names a parent that is not in the document.`,
      nodeIds: [instance.parentId],
    }
  }

  const copy = regenerateIds(definition, new Set(Object.keys(document.nodes)), options.random)
  const placed = insert(
    document,
    copy,
    instance.parentId,
    parent.children.indexOf(instanceId),
    options,
  )

  if (!placed.ok) return placed

  return remove(placed.document, instanceId)
}

/**
 * A page with its instances replaced by what they point at.
 *
 * What the renderer draws. An instance is a placeholder, and every walk over
 * a document — styles, fonts, asset references, theme tokens — would have to
 * learn about placeholders if the renderer expanded them as it went. Doing
 * it once, up front, means none of them do: what they receive is an ordinary
 * document.
 *
 * ## The ids are derived, never random
 *
 * `detachSymbol` mints fresh ids because its result is written down, and two
 * copies of a footer must not share them. Nothing here is written down — it
 * is rebuilt on every render — so a random id would be a different id each
 * time, which is a changed React key on every pass and a server and a
 * browser disagreeing about what they rendered.
 *
 * So an expanded node's id is a function of where it came from: the instance
 * that placed it and the node it was in the definition. Same page, same ids,
 * every time, on both sides of the wire.
 *
 * Hashed rather than concatenated because a node id is capped at 64
 * characters and joining two of them is not. An opaque id is acceptable here
 * in a way it would not be for a stored one: nothing outside a single render
 * ever sees it.
 *
 * ## A symbol does not place another symbol
 *
 * An instance inside a definition is reported rather than expanded. Nesting
 * is a tree to walk, a depth to cap and a cycle to detect — a symbol placing
 * itself is an infinite page — and nobody has asked for one. Refusing makes
 * the loop impossible by construction instead of by a guard that has to be
 * right.
 */

export interface Expansion {
  /** Ordinary nodes all the way down. */
  document: CheckoutSchema
  /** Instances left as they were, and why. */
  unexpanded: UnexpandedInstance[]
}

export interface UnexpandedInstance {
  nodeId: string
  /** The symbol it names, when it names one. */
  symbolId: string | null
  reason:
    /** The project has no such symbol, or it was not supplied. */
    | "no-definition"
    /** It names no symbol at all. */
    | "no-symbol"
    /** It sits inside a symbol, and symbols do not nest. */
    | "nested"
}

export function expandSymbols(
  document: CheckoutSchema,
  definitions: ReadonlyMap<string, Fragment>,
): Expansion {
  const unexpanded: UnexpandedInstance[] = []
  const nodes: Record<string, Node> = {}

  for (const [id, node] of Object.entries(document.nodes)) {
    if (node.type !== SYMBOL_INSTANCE_TYPE) {
      nodes[id] = node

      continue
    }

    const symbolId = symbolIdOf(node.props)

    if (symbolId === null) {
      unexpanded.push({ nodeId: id, symbolId: null, reason: "no-symbol" })
      nodes[id] = node

      continue
    }

    const definition = definitions.get(symbolId)

    if (definition === undefined) {
      unexpanded.push({ nodeId: id, symbolId, reason: "no-definition" })
      nodes[id] = node

      continue
    }

    const placed = place(node, definition, unexpanded)

    for (const [expandedId, expanded] of Object.entries(placed)) nodes[expandedId] = expanded
  }

  return { document: { ...document, nodes }, unexpanded }
}

/**
 * One instance's nodes, under ids derived from where they came from.
 *
 * The definition's root takes the instance's own place — its id, its parent
 * and its position among that parent's children — so nothing around it has
 * to be rewritten. The instance is gone and the symbol is standing where it
 * stood.
 */
function place(
  instance: Node,
  definition: Fragment,
  unexpanded: UnexpandedInstance[],
): Record<string, Node> {
  const idFor = (nodeId: string): string =>
    nodeId === definition.rootId ? instance.id : expandedId(instance.id, nodeId)

  const placed: Record<string, Node> = {}

  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    if (node.type === SYMBOL_INSTANCE_TYPE) {
      unexpanded.push({
        nodeId: idFor(nodeId),
        symbolId: symbolIdOf(node.props),
        reason: "nested",
      })
    }

    const isRoot = nodeId === definition.rootId

    placed[idFor(nodeId)] = {
      ...node,
      id: idFor(nodeId),
      /*
       * The root inherits the instance's parent and the instance's styles,
       * because a symbol placed in a page is positioned by the page. Every
       * other node keeps what the definition gave it.
       */
      parentId: isRoot ? instance.parentId : idFor(node.parentId as string),
      children: node.children.map(idFor),
      ...(isRoot ? { styles: instance.styles } : {}),
    }
  }

  return placed
}

/**
 * A stable id for a node that only exists while something is being drawn.
 *
 * FNV-1a, which is not a cryptographic hash and is not being asked to be
 * one. What it has to be is the same answer every time for the same input,
 * short enough to fit the 64-character cap, and unlikely enough to collide
 * that two nodes on one page never do.
 */
function expandedId(instanceId: string, nodeId: string): string {
  let hash = 0x81_1c_9d_c5
  const seed = `${instanceId}.${nodeId}`

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0
  }

  return `sym_${hash.toString(16).padStart(8, "0")}${String(seed.length)}`
}

/**
 * Definitions out of the JSON a revision stored them as.
 *
 * The inverse of what the API writes when it snapshots a page's symbols, and
 * in this package rather than beside that because both applications need it
 * and neither should reach into the other's services to get it.
 *
 * Parsed rather than cast. The column holds whatever was written into it,
 * possibly by an older version of this product, and a definition that cannot
 * be read is skipped and named: its instances stay as instances and the
 * renderer reports them, which is a page missing its footer rather than a
 * page that throws.
 */
const storedFragment = z
  .object({ rootId: nodeId, nodes: z.record(nodeId, nodeSchema) })
  .strict()
  .refine((value) => value.nodes[value.rootId] !== undefined, {
    message: "A symbol's root must be one of its nodes.",
  })

export interface SnapshotRead {
  symbols: ReadonlyMap<string, Fragment>
  /** Symbol ids whose stored definition could not be read. */
  skipped: string[]
}

export function readSymbolSnapshot(value: unknown): SnapshotRead {
  const symbols = new Map<string, Fragment>()
  const skipped: string[] = []

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { symbols, skipped }
  }

  for (const [symbolId, stored] of Object.entries(value)) {
    const parsed = storedFragment.safeParse(stored)

    if (parsed.success) symbols.set(symbolId, parsed.data)
    else skipped.push(symbolId)
  }

  return { symbols, skipped }
}
