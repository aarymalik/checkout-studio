import "server-only"

import { pageRepository, type TenantContext } from "@checkout-studio/database"
import { assetReferences, parseDocument } from "@checkout-studio/schema"

/**
 * Which of a project's assets are still pointed at, and from where.
 *
 * ## Why "where" and not just "whether"
 *
 * A delete that is refused has to say what to do about it. "This asset is in
 * use" leaves somebody opening pages until they find it; "still used on
 * Checkout and Thank you" is an answer they can act on. docs/phases.md asks
 * for exactly that — "delete blocked when the asset is in use; explains
 * where".
 *
 * ## One walk, the schema's
 *
 * `assetReferences` is the same function the published renderer uses to
 * decide which assets to load. The two ends of this question — what a page
 * needs, and whether anything still needs this — have to agree, and the way
 * to make sure of that is for there to be one of them.
 */

export interface AssetUse {
  pageId: string
  pageTitle: string
  /** The working copy, or the revision the page is serving. */
  source: "draft" | "published"
}

/**
 * A document this project holds that cannot be read.
 *
 * Thrown rather than skipped. A draft is validated before it is stored, so
 * this should not happen — and if it has, the honest answer to "is anything
 * using this asset" is that we do not know. Guessing "no" here is how a live
 * page loses a picture, and that is worse than a delete that will not go
 * through until somebody looks at the page.
 */
export class UnreadableDocumentError extends Error {
  override readonly name = "UnreadableDocumentError"

  constructor(
    readonly pageId: string,
    readonly source: "draft" | "published",
  ) {
    super(`The ${source} of page ${pageId} could not be read.`)
  }
}

/**
 * Every asset this project's pages name, with the places that name them.
 *
 * Assets with no uses are absent rather than present with an empty list: the
 * map answers "where is this used", and a library of a thousand untouched
 * uploads should not be a thousand empty arrays.
 */
async function assetUsage(
  tenant: TenantContext,
): Promise<ReadonlyMap<string, readonly AssetUse[]>> {
  const documents = await pageRepository.storedDocuments(tenant)
  const usage = new Map<string, AssetUse[]>()

  for (const stored of documents) {
    const parsed = parseDocument(stored.schema)

    if (!parsed.ok) throw new UnreadableDocumentError(stored.pageId, stored.source)

    const where: AssetUse = {
      pageId: stored.pageId,
      pageTitle: stored.pageTitle,
      source: stored.source,
    }

    for (const assetId of assetReferences(parsed.document)) {
      const found = usage.get(assetId)

      if (found === undefined) usage.set(assetId, [where])
      else found.push(where)
    }
  }

  return usage
}

/**
 * The places one asset is used, which is empty when it is used nowhere.
 *
 * A whole-project pass for one asset, deliberately: a project has tens of
 * pages, the documents are rows this query already reads in one go, and the
 * alternative is a second walk that could answer differently from the first.
 */
export async function usesOfAsset(
  tenant: TenantContext,
  assetId: string,
): Promise<readonly AssetUse[]> {
  return (await assetUsage(tenant)).get(assetId) ?? []
}
