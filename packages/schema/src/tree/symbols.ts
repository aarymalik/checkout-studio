import type { CheckoutSchema, PropValue } from "../document/schema"
import { traverse } from "./traverse"
import { regenerateIds } from "./fragment"
import type { Fragment } from "./fragment"
import { insert, remove } from "./operations"
import type { TreeOptions, TreeResult } from "./operations"

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
