import "server-only"

import { assetRepository } from "@checkout-studio/database"
import type { StoredAsset, TenantContext } from "@checkout-studio/database"
import { Errors } from "@checkout-studio/utils"
import type { AppError, UploadKind } from "@checkout-studio/utils"

import { assertCan } from "../billing/entitlements"
import { acceptUpload } from "./accept"
import type { RefusedUpload } from "./accept"
import { masterKey, renditionKey } from "./keys"
import { rasterEncoder } from "./raster"
import { renditionsOfMaster } from "./renditions"
import type { Rendition } from "./renditions"
import type { ObjectStore } from "./store"

/**
 * An upload, from bytes to a row somebody can find again.
 *
 * Every part of this exists already — the boundary, the sanitizer, the
 * re-encoder, the renditions, the keys, the store, the repository and the
 * entitlement. What is here is the order they go in, and the order is the
 * design.
 *
 * ## The order
 *
 * 1. `acceptUpload`, which refuses what cannot be stored before any work is
 *    done on it, and answers with the bytes that *will* be stored.
 * 2. A look for those bytes in this project. Finding them ends the upload:
 *    nothing is derived, nothing is written, no quota is charged, because
 *    uploading a picture that is already there costs nothing. `create` does
 *    not need this lookup — the unique index answers — but an upload does,
 *    and for different reasons.
 * 3. The quota, against the master's size. Cheap, and it stops an upload that
 *    cannot possibly fit before seconds of AVIF encoding.
 * 4. The renditions.
 * 5. The quota again, against the exact total. There is no single honest
 *    check: a rendition has no size until it exists, and finding out costs
 *    seconds. So one check stops the hopeless case and the other gates the
 *    write, and each is honest about what it knew.
 * 6. The bytes.
 * 7. The row.
 *
 * ## Only a raster is derived from
 *
 * Asked of `rasterEncoder`, which is the same question `acceptUpload` asks to
 * decide what to re-encode, so there is one answer rather than two.
 *
 * A font, a video and a PDF have no renditions because nothing here decodes
 * them. A drawing has none for a better reason: an SVG is already every size,
 * and handing one to libvips would rasterize it through the librsvg named in
 * the `sharp` row of the override table — the one thing the asset pipeline is
 * arranged so as never to reach.
 *
 * ## Bytes before the row
 *
 * If writing the row fails after the bytes are written, what is left is
 * content-addressed rubbish that a sweep can collect, and the merchant's
 * retry writes the same keys again harmlessly. The other order leaves a row
 * pointing at nothing — a broken image on a page that takes card details, and
 * no way to tell which rows are the broken ones.
 *
 * ## A refusal and a quota are different answers
 *
 * A file that cannot be stored comes back as a refusal, because which file and
 * why is the merchant's to fix. A plan that will not hold it is thrown by
 * `assertCan`, as every other billable action's is: it is not a fact about the
 * file, and the single enforcement point is the reason limits are not enforced
 * in four places and forgotten in the fifth.
 *
 * See docs/phases.md Phase 14 and docs/security.md § File Upload Security.
 */

export interface UploadRequest {
  tenant: TenantContext
  store: ObjectStore
  bytes: Uint8Array
  fileName: string
  limits?: Partial<Record<UploadKind, number>>
  maxPixels?: number
}

export interface UploadStored {
  ok: true
  asset: StoredAsset
  /** True when these bytes were already in the project and nothing was written. */
  deduplicated: boolean
  /**
   * The bytes that were stored, which are not the bytes that arrived.
   *
   * Handed back so the optimizer derives from the master rather than from
   * the upload. They are not the same picture: the master has been
   * re-encoded, its metadata stripped and its orientation applied, so
   * renditions taken from the original can differ in size and in which way
   * up they are.
   */
  master: Uint8Array
}

export type UploadResult = UploadStored | RefusedUpload

export async function storeUpload(request: UploadRequest): Promise<UploadResult> {
  const { tenant, store } = request

  const accepted = await acceptUpload({
    bytes: request.bytes,
    fileName: request.fileName,
    ...(request.limits === undefined ? {} : { limits: request.limits }),
    ...(request.maxPixels === undefined ? {} : { maxPixels: request.maxPixels }),
  })

  if (!accepted.ok) return accepted

  const existing = await assetRepository.findBySha256(tenant, accepted.sha256)

  if (existing !== null) {
    return { ok: true, asset: existing, deduplicated: true, master: accepted.bytes }
  }

  /*
   * The quota is the plan's, so it is asked of the person rather than the
   * project, and what they already hold includes every rendition of it.
   */
  const held = await assetRepository.storageUsed(tenant)

  await assertCan(tenant.userId, "uploadAsset", {
    current: held,
    increment: accepted.sizeBytes,
  })

  await store.put({
    key: masterKey(accepted.sha256, accepted.type.extension),
    bytes: accepted.bytes,
    contentType: accepted.type.mimeType,
  })

  const created = await assetRepository.create(tenant, {
    fileName: accepted.fileName,
    mimeType: accepted.type.mimeType,
    sizeBytes: accepted.sizeBytes,
    /*
     * Measured by the re-encoder, which had the image open anyway. So the
     * row is complete the moment it is written, even though nothing has been
     * resized yet — the resizing is what no longer happens here.
     */
    width: accepted.width,
    height: accepted.height,
    storageKey: masterKey(accepted.sha256, accepted.type.extension),
    url: store.url(masterKey(accepted.sha256, accepted.type.extension)),
    sha256: accepted.sha256,
    renditions: [],
  })

  return {
    ok: true,
    asset: created.asset,
    deduplicated: created.deduplicated,
    master: accepted.bytes,
  }
}

/**
 * A rendition as it is recorded: everything but the bytes.
 *
 * `sizeBytes` is taken from the bytes rather than carried beside them, so the
 * size on the row cannot describe a different file than the one that was put.
 */
/**
 * Derives an asset's renditions and records them, after the upload answered.
 *
 * ## Why this is not part of the upload
 *
 * Four sizes in two formats is seconds of encoding for a photograph, and all
 * of it used to happen while the merchant's browser held the connection open.
 * docs/phases.md asks for the opposite in three words — "optimization runs
 * asynchronously" — and the library was already built for it: an asset with
 * no renditions serves its master, which `libraryAsset` says in as many
 * words, and `assetUrls` emits no `srcSet` rather than a broken one.
 *
 * So the master is stored, the row is written, the merchant sees their
 * picture, and this runs afterwards.
 *
 * ## What is lost if it never runs
 *
 * Bandwidth, and nothing else. The master is stored first and always serves,
 * so a process that dies between the response and this leaves an asset that
 * works and is larger than it needs to be. That is the trade `after` makes:
 * it is not a queue, nothing retries, and the right time to add one is when
 * something depends on the renditions existing rather than preferring them.
 *
 * ## The quota, and what gives way
 *
 * The master was charged before it was stored. The renditions are charged
 * here, against what is held now — and if they do not fit, they are not
 * written. The upload used to be refused in that case, which spent a
 * merchant's work to protect a ceiling that the master alone did not reach.
 * Keeping the picture and skipping its optimization is the smaller loss, and
 * the ceiling still holds.
 */
export async function optimizeAsset(input: {
  tenant: TenantContext
  store: ObjectStore
  asset: StoredAsset
  /** The master's bytes, as stored. */
  bytes: Uint8Array
  maxPixels?: number
}): Promise<void> {
  const { tenant, store, asset, bytes } = input

  if (rasterEncoder(asset.mimeType) === null) return

  /*
   * Asked through `renditionsOfMaster`, which does not refuse: these are
   * bytes `acceptUpload` wrote, for a type `rasterEncoder` named, under the
   * same ceiling. A branch for a refusal that cannot arrive is a branch no
   * test could reach.
   */
  const derived = await renditionsOfMaster(bytes, input.maxPixels)
  const total = derived.renditions.reduce((sum, one) => sum + one.bytes.length, 0)

  if (!(await fits(tenant.userId, total))) return

  /*
   * One after another, like the encoding that produced them. Six writes in
   * parallel from every concurrent upload is a way to find out how many
   * sockets a process has.
   */
  for (const rendition of derived.renditions) {
    // Awaited in the loop on purpose. See the note above.
    await store.put({
      key: renditionKey(asset.sha256, rendition.size, rendition.format),
      bytes: rendition.bytes,
      contentType: rendition.mimeType,
    })
  }

  /*
   * Last, so the row never claims a rendition that is not in the store. The
   * other order would have a page asking for a file that is still being
   * written.
   */
  await assetRepository.setRenditions(tenant, asset.id, derived.renditions.map(recorded))
}

/**
 * Whether this much more fits, answered rather than thrown.
 *
 * `assertCan` throws, which is right where a merchant is waiting for an
 * answer and wrong here: there is nobody to tell, and the upload has already
 * succeeded.
 */
async function fits(userId: string, increment: number): Promise<boolean> {
  try {
    await assertCan(userId, "uploadAsset", {
      current: await assetRepository.storageUsed({ userId }),
      increment,
    })

    return true
  } catch {
    return false
  }
}

function recorded(rendition: Rendition) {
  return {
    size: rendition.size,
    format: rendition.format,
    width: rendition.width,
    height: rendition.height,
    sizeBytes: rendition.bytes.length,
  }
}

/**
 * What to tell somebody whose upload was refused.
 *
 * Here rather than in the route handler, because mapping a refusal to a
 * sentence is a decision about the product and not about HTTP, and because a
 * route handler is the one place in this codebase that cannot be tested
 * without a request.
 *
 * Each sentence names the thing the merchant can change. The reasons the
 * sanitizer gives — a DOCTYPE, a CDATA section, an unknown entity — are all
 * true and none of them is useful to the person who exported the file, so they
 * share one sentence and the specific reason goes to the log through the
 * error's context.
 */
const SENTENCES: Partial<Record<RefusedUpload["reason"], string>> = {
  empty: "No file was sent.",
  unrecognised: "That file type isn't supported.",
  "unsafe-name": "That file name can't be used. Try renaming the file.",
  unreadable: "That image couldn't be read. Try exporting it again.",
  "too-many-pixels": "That image is too large to process. Try a smaller version.",
}

const DRAWING = "That drawing couldn't be made safe to publish."

export function uploadRefusalError(refusal: RefusedUpload): AppError {
  /*
   * `too-large` is the one refusal that already has an error, and the one that
   * can say a number. The limit it names is the stored file's ceiling, which
   * for a re-encoded image is not the size of what was sent — so the error
   * reports the ceiling and one byte past it rather than inventing a size.
   */
  if (refusal.reason === "too-large" && refusal.limit !== undefined) {
    return Errors.validation.fileTooLarge(refusal.limit + 1, refusal.limit)
  }

  return Errors.validation.uploadRejected(refusal.reason, SENTENCES[refusal.reason] ?? DRAWING)
}
