import "server-only"

import { assetReferrers } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"
import type { StoredAsset } from "@checkout-studio/database"

/**
 * What a bundle says about the files it carries.
 *
 * docs/export-import.md § Asset Registry. The bundle holds bytes somewhere —
 * beside the manifest in a ZIP, behind a URL in a JSON bundle — and this is
 * the table that says what each one is and who was pointing at it.
 *
 * ## Matched on content, never on name
 *
 * "Assets are matched on import by `sha256`, not by filename. Identical bytes
 * are never stored twice." Two projects both holding `logo.png` are two
 * different pictures; the same picture uploaded twice under two names is one.
 * So the hash is what an importer deduplicates against, and the file name is
 * carried for people rather than for matching.
 *
 * ## It records who pointed at it
 *
 * `referencedBy` is what makes rehydration possible. An asset arriving in an
 * installation that has never seen it gets a new id, and every reference to
 * the old one has to be rewritten — which cannot be done by searching for a
 * string, because the same walk that found them is the only thing that knows
 * where a reference may hide.
 *
 * An asset only the page's settings name has an empty list. That is the
 * truth, not an omission: the favicon and the social image belong to the
 * document and to no node, and rewriting has to reach them separately.
 *
 * ## No I/O
 *
 * The rows are passed in. The stage that knows which tenant is exporting is
 * the stage that should be reading their database, and a registry builder
 * that fetched its own rows could not be tested without one.
 */

export interface AssetRegistryEntry {
  /** Its id in the workspace it came from. Rewritten on import. */
  sourceId: string
  /** Absolute URL. Present for JSON bundles, where the bytes do not travel. */
  url?: string
  fileName: string
  mimeType: string
  bytes: number
  width?: number
  height?: number
  /** What an importer deduplicates against. */
  sha256: string
  /** Node ids that reference it, sorted. Empty when only the settings do. */
  referencedBy: string[]
}

export interface AssetRegistry {
  entries: AssetRegistryEntry[]
  /**
   * Assets the document names that were not among the rows given.
   *
   * A reference to something the library no longer holds. Named rather than
   * skipped, for the same reason an unprovided component type is: a bundle
   * that imports cleanly and renders a missing picture tells nobody why.
   */
  missing: string[]
}

export function assetRegistry(
  document: CheckoutSchema,
  assets: readonly StoredAsset[],
): AssetRegistry {
  const rows = new Map(assets.map((asset) => [asset.id, asset]))
  const entries: AssetRegistryEntry[] = []
  const missing: string[] = []

  /*
   * Sorted by id. The walk returns assets in the order the tree reached them,
   * which changes when a node moves — and the registry is inside the payload
   * the checksum covers.
   */
  const referrers = [...assetReferrers(document)].sort(([left], [right]) => (left < right ? -1 : 1))

  for (const [assetId, referencedBy] of referrers) {
    const row = rows.get(assetId)

    if (row === undefined) {
      missing.push(assetId)

      continue
    }

    entries.push({
      sourceId: row.id,
      url: row.url,
      fileName: row.fileName,
      mimeType: row.mimeType,
      bytes: row.sizeBytes,
      ...(row.width === null ? {} : { width: row.width }),
      ...(row.height === null ? {} : { height: row.height }),
      sha256: row.sha256,
      referencedBy: [...referencedBy],
    })
  }

  return { entries, missing }
}
