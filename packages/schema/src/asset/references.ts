import type { CheckoutSchema, PropValue } from "../document/schema"
import { traverse } from "../tree/traverse"

/**
 * Every asset a document refers to, and from where.
 *
 * ## Three callers, one walk
 *
 * The renderer needs the ids to know which assets to load before it can turn
 * `{ "$asset": "ast_9f2a" }` into URLs. Deleting an asset needs them to know
 * whether anything still points at it. Exporting needs to know *which nodes*
 * point at each one, because a bundle's asset registry says so and an import
 * rewrites those references.
 *
 * All three are the same question asked from different ends, so there is one
 * answer to keep correct — and a walk that missed a place a reference can hide
 * would be a broken image in one case, a deleted file still in use in another,
 * and an asset left behind on import in the third.
 *
 * ## Where a reference can be
 *
 * Props, nested to any depth: a list of features is an array of objects and
 * each may carry an icon. Plus the two fields in `settings` that name one —
 * the social image and the favicon.
 *
 * Not styles. A style value is a string, a number, a boolean or null, and an
 * asset reference is an object, which is why a background image is a prop and
 * cannot be responsive. That is stated where the property is declared, and it
 * is the reason this walk does not look there. Theme tokens are the mirror of
 * this and live in styles — see theme/references.ts.
 */

function isReference(value: object): value is { $asset: string } {
  return "$asset" in value && typeof (value as { $asset: unknown }).$asset === "string"
}

function collectFrom(value: PropValue, found: (assetId: string) => void): void {
  if (value === null || typeof value !== "object") return

  if (Array.isArray(value)) {
    for (const entry of value) collectFrom(entry, found)

    return
  }

  if (isReference(value)) {
    found(value.$asset)

    return
  }

  /*
   * A `$var` reference lands here and contributes nothing, which is right: a
   * variable's value arrives at render time and may be anything, so a document
   * cannot say in advance which asset it will name. An asset chosen through a
   * variable is a reference this cannot see — and so is one nothing can, which
   * is why the control writes a reference rather than a variable.
   */
  for (const entry of Object.values(value)) collectFrom(entry, found)
}

/**
 * The assets this document names, each with the nodes that name it.
 *
 * An asset referred to only by the page's settings is present with an empty
 * list, which is the truth rather than an oversight: the social image and the
 * favicon belong to the document and to no node. Anything rewriting
 * references by node id has to reach them separately, exactly as this walk
 * does.
 *
 * Node ids are sorted, so the same document always answers the same way. The
 * order a tree happened to be walked in is not a fact about the page, and a
 * bundle whose registry changed because a node moved and moved back is a
 * bundle whose checksum means less than it should.
 */
export function assetReferrers(document: CheckoutSchema): ReadonlyMap<string, readonly string[]> {
  const byAsset = new Map<string, Set<string>>()

  const record = (assetId: string, nodeId: string | null): void => {
    const nodes = byAsset.get(assetId) ?? new Set<string>()

    if (nodeId !== null) nodes.add(nodeId)
    byAsset.set(assetId, nodes)
  }

  traverse(document, ({ node }) => {
    for (const value of Object.values(node.props)) {
      collectFrom(value, (assetId) => {
        record(assetId, node.id)
      })
    }
  })

  /*
   * Settings last, and read directly rather than through the walk: they belong
   * to the document and not to any node, so no amount of tree walking reaches
   * them. They are the two references easiest to forget, which is why they are
   * named here rather than discovered.
   */
  const seoImage = document.settings.seo?.image

  if (seoImage !== undefined) record(seoImage.$asset, null)

  const favicon = document.settings.favicon

  if (favicon !== undefined) record(favicon.$asset, null)

  return new Map(
    [...byAsset].map(([assetId, nodes]) => [
      assetId,
      [...nodes].sort((left, right) => (left < right ? -1 : 1)),
    ]),
  )
}

/**
 * The asset ids this document names, each once.
 *
 * A set rather than a list, because the same logo on six nodes is one asset to
 * load and one row to count as in use.
 */
export function assetReferences(document: CheckoutSchema): ReadonlySet<string> {
  return new Set(assetReferrers(document).keys())
}
