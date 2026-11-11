import "server-only"

import { assetReferences, tokenReferences, traverse } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

/**
 * What a document names, which is what a bundle has to declare.
 *
 * Step 4 of docs/export-import.md § Export Workflow: walk the node tree and
 * collect the referenced assets, component types, fonts and theme tokens. This
 * is the part of that step a document can answer on its own — the rest needs
 * something the document cannot see, and keeping the two apart is the point.
 *
 * ## Only what the document knows
 *
 * `plugins` is not here, and deliberately. A component type does not name its
 * plugin: `core.image` is in the `core` namespace, which `core-layout`,
 * `core-content` and `core-embed` all share, so the plugin that registered a
 * type is a fact the *registry* holds. Deriving it from the string would be a
 * guess that happens to be right for one of three plugins.
 *
 * Fonts are the same shape of problem in the other direction: a font
 * requirement is a family, its weights and where the file comes from, and all
 * three live in the theme. A document names a token; the theme says what the
 * token is.
 *
 * So this returns what a document can be asked, and the stage that holds a
 * registry and a theme turns it into requirements. A collector that reached
 * for either would be a pure walk with two global dependencies, and the first
 * test would need a plugin host.
 *
 * ## Sorted, because a bundle is compared byte for byte
 *
 * Sets come out in insertion order, which is the order a tree happened to be
 * walked in. Two exports of the same page would then differ because a node was
 * moved and moved back. Sorting makes re-export idempotent, which is what lets
 * the checksum answer "has this changed?".
 */

export interface DocumentReferences {
  /** Every component type used, each once. */
  componentTypes: string[]
  /** Every asset named, each once. Deduplicated by content hash later. */
  assetIds: string[]
  /** Theme token paths the styles name, as `colors.primary`. */
  tokens: string[]
  /**
   * How many nodes travel, for the manifest's contents summary.
   *
   * Counted by the walk rather than off the `nodes` map, which cannot
   * disagree: a document with a node unreachable from the root does not
   * validate — see the schema's `orphan` failure — so there is nothing in
   * the map the walk does not reach.
   */
  totalNodes: number
}

export function documentReferences(document: CheckoutSchema): DocumentReferences {
  const types = new Set<string>()
  let totalNodes = 0

  traverse(document, ({ node }) => {
    types.add(node.type)
    totalNodes += 1
  })

  return {
    componentTypes: sorted(types),
    assetIds: sorted(assetReferences(document)),
    tokens: sorted(tokenReferences(document)),
    totalNodes,
  }
}

/**
 * Sorted by code point, not by locale.
 *
 * `localeCompare` would order the same two types differently on two machines,
 * and a bundle that is a different file depending on where it was exported is
 * not a bundle whose checksum means anything.
 *
 * No equal case, because the input is a set: two elements are never the same
 * string, so a comparator returning zero would be a branch nothing can reach.
 */
function sorted(values: ReadonlySet<string>): string[] {
  return [...values].sort((left, right) => (left < right ? -1 : 1))
}
