import "server-only"

import { symbolRepository, type TenantContext } from "@checkout-studio/database"
import { symbolReferences } from "@checkout-studio/schema"
import type { CheckoutSchema, Fragment } from "@checkout-studio/schema"

/**
 * The symbol definitions a revision has to carry.
 *
 * docs/schema.md § Symbols: "Published revisions snapshot the symbol
 * definitions they use, so editing a symbol never changes a live page." The
 * same sentence the theme is snapshotted for, and the same reason — a
 * revision has to render as it did, and a later edit must not reach back
 * into it.
 *
 * Without this a revision is a page with holes where its symbols were, and
 * the holes only appear later: the revision is written, somebody edits the
 * footer, and a page that was published in March starts rendering April's
 * footer. There is no error, no log line, and nothing to point at.
 *
 * ## Only the ones the page places
 *
 * A project's whole symbol library would make every revision carry
 * everything, including symbols the page never used and symbols created
 * after it. `symbolReferences` is what the page actually asks for.
 *
 * ## One that is gone is left out
 *
 * A reference to a symbol that has since been deleted produces no entry.
 * The instance survives in the schema and the renderer reports it as
 * unexpanded, which is the same answer it gives for a page whose symbol is
 * missing today. Writing a placeholder entry instead would be inventing a
 * definition nobody wrote.
 */

/**
 * Keyed by symbol id, in the shape the renderer expands from.
 *
 * With the name, which the renderer drops and everything else wants: a
 * bundle lists what it carries, and somebody restoring a revision should see
 * what the symbol was called rather than an id.
 */
export type SymbolSnapshot = Record<string, Fragment & { name: string }>

export async function snapshotSymbols(
  tenant: TenantContext,
  document: CheckoutSchema,
): Promise<SymbolSnapshot> {
  const wanted = symbolReferences(document)

  if (wanted.size === 0) return {}

  const snapshot: SymbolSnapshot = {}

  /*
   * The project's symbols in one read rather than one per reference. A page
   * places a handful and a project holds tens, and two queries that could
   * disagree are worse than one that reads a little too much — the same call
   * the asset library makes.
   */
  for (const symbol of await symbolRepository.list(tenant)) {
    if (!wanted.has(symbol.id)) continue

    snapshot[symbol.id] = {
      name: symbol.name,
      rootId: symbol.rootNodeId,
      nodes: symbol.nodes as Fragment["nodes"],
    }
  }

  return snapshot
}
