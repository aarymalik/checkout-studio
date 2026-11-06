import "server-only"

import { assetRepository, type TenantContext } from "@checkout-studio/database"

import { usesOfAsset, type AssetUse } from "./usage"

/**
 * Taking an asset out of the library.
 *
 * ## Refused while anything still points at it
 *
 * docs/phases.md asks for this in one line — "delete blocked when the asset
 * is in use; explains where" — and the second half is the part that makes it
 * worth having. A merchant who is told "in use" opens pages until they find
 * it; one who is told "still used on Checkout" goes to Checkout.
 *
 * ## Soft, even so
 *
 * The check reads the documents this project holds, and a check can be wrong
 * in one direction. A row with a date on it can be put back; a file removed
 * from storage cannot, and neither can the renditions derived from it. So the
 * refusal is the safety a merchant sees and the soft delete is the one they
 * do not.
 */

export type AssetDeletion =
  | { ok: true }
  /** No such asset in this project — or not this tenant's, which answers alike. */
  | { ok: false; reason: "not-found" }
  /** Still pointed at, by these places, written for a person to read. */
  | { ok: false; reason: "in-use"; places: readonly string[] }

export async function deleteAsset(tenant: TenantContext, assetId: string): Promise<AssetDeletion> {
  /*
   * Looked up first, so an id that does not exist is a 404 rather than a walk
   * of every page in the project to discover that nothing uses it.
   */
  const asset = await assetRepository.findById(tenant, assetId)

  if (asset === null) return { ok: false, reason: "not-found" }

  const uses = await usesOfAsset(tenant, assetId)

  if (uses.length > 0) return { ok: false, reason: "in-use", places: placesOf(uses) }

  /*
   * The answer is not read, deliberately. False means the row went between
   * the lookup and the write — deleted in another tab, most often — and the
   * state the caller asked for is the state that holds either way. Reporting
   * "not found" for an asset that is, in fact, gone would be a refusal with
   * nothing behind it.
   */
  await assetRepository.softDelete(tenant, assetId)

  return { ok: true }
}

/**
 * The pages to name in the refusal, one line each.
 *
 * A page whose *published* version uses it while its draft no longer does is
 * marked, because the merchant has already taken the picture off that page as
 * far as they are concerned. "Still used on Checkout" would read as a bug;
 * "Checkout (published)" tells them the edit is waiting to go live.
 */
function placesOf(uses: readonly AssetUse[]): readonly string[] {
  const drafts = new Set(uses.filter((use) => use.source === "draft").map((use) => use.pageId))
  const places = new Map<string, string>()

  for (const use of uses) {
    // A page whose draft uses it is named once, plainly. The marker is for
    // the page where only the live version still does.
    if (use.source === "published" && drafts.has(use.pageId)) continue

    places.set(use.pageId, use.source === "draft" ? use.pageTitle : `${use.pageTitle} (published)`)
  }

  return [...places.values()]
}
