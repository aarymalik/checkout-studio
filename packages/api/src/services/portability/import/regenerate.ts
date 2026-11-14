import "server-only"

import { createId, rewriteAssetReferences } from "@checkout-studio/schema"
import type { CheckoutSchema, Node, RandomSource } from "@checkout-studio/schema"

/**
 * An imported page stops being the page it was.
 *
 * Steps 9 and 10 of docs/export-import.md § Import Workflow, which state the
 * rules rather than leaving them to be inferred:
 *
 *     Every node id is regenerated.
 *     The map is built before any reference rewriting begins.
 *     Rewriting is a single pass over the fully-mapped document.
 *     An unmapped reference is a hard failure, never a silent drop.
 *
 * The last is the one worth having. `regenerateIds` in the schema package —
 * the one paste and duplicate use — keeps an id it cannot map, which is right
 * there: a fragment's root has a parent outside the fragment, and that parent
 * is still the right answer. Here it is never right. An unmapped reference
 * means the bundle names something it did not bring, and carrying the old id
 * into this project either points at a stranger's row or at nothing at all.
 *
 * ## Two maps, one pass
 *
 * Nodes are regenerated here; assets are not. An asset's target id comes from
 * reconciliation, which already decided whether each one is an upload or a
 * reuse of bytes this project holds — this is handed that answer rather than
 * inventing a second one.
 *
 * ## What a reference can be, in this schema
 *
 * `root`, `parentId`, `children` and `{ $asset }`. The workflow also lists
 * symbol references, visibility rule targets and link targets; none of them
 * name a node here. A visibility condition's `source` is a data path like
 * `order.total`, a link's `href` is a URL, and symbols do not exist yet. When
 * they do, this is where they join, and the rewrite is where the test will
 * fail if they do not.
 */

export interface UnmappedReference {
  kind: "node" | "asset"
  id: string
  /** Where it was found, for a report somebody has to act on. */
  at: string
}

export type Regeneration =
  | {
      ok: true
      document: CheckoutSchema
      /** Source id to new id, kept for the import report. */
      nodes: ReadonlyMap<string, string>
    }
  | { ok: false; unmapped: UnmappedReference[] }

export function regenerateDocument(
  document: CheckoutSchema,
  /** Source asset id to the id it will have here, from reconciliation. */
  assets: ReadonlyMap<string, string>,
  taken: ReadonlySet<string> = new Set(),
  random: RandomSource = Math.random,
): Regeneration {
  /*
   * Built in full before anything is rewritten. A pass that minted ids as it
   * met them would rewrite a child before knowing what its node became, and
   * the order the tree happens to be walked in would decide correctness.
   */
  const claimed = new Set(taken)
  const nodes = new Map<string, string>()

  for (const [id, node] of Object.entries(document.nodes)) {
    const fresh = createId(node.type, claimed, random)

    claimed.add(fresh)
    nodes.set(id, fresh)
  }

  const unmapped: UnmappedReference[] = []

  const nodeTarget = (id: string, at: string): string => {
    const mapped = nodes.get(id)

    if (mapped === undefined) {
      unmapped.push({ kind: "node", id, at })

      return id
    }

    return mapped
  }

  const rewritten: Record<string, Node> = {}

  for (const [id, node] of Object.entries(document.nodes)) {
    const fresh = nodeTarget(id, `nodes.${id}`)

    rewritten[fresh] = {
      ...node,
      id: fresh,
      parentId: node.parentId === null ? null : nodeTarget(node.parentId, `nodes.${id}.parentId`),
      children: node.children.map((child, index) =>
        nodeTarget(child, `nodes.${id}.children[${String(index)}]`),
      ),
    }
  }

  const withAssets = rewriteAssetReferences(
    { ...document, root: nodeTarget(document.root, "root"), nodes: rewritten },
    assets,
  )

  for (const id of withAssets.unmapped) {
    unmapped.push({ kind: "asset", id, at: "document" })
  }

  return unmapped.length > 0
    ? { ok: false, unmapped }
    : { ok: true, document: withAssets.document, nodes }
}
