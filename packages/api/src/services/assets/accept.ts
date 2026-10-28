import "server-only"

import { SVG_TYPE, contentHash, inspectUpload, limitFor } from "@checkout-studio/utils"
import type { UploadKind, UploadRefusal, UploadType } from "@checkout-studio/utils"

import { rasterEncoder, reencodeRaster } from "./raster"
import type { RasterRefusal } from "./raster"
import { sanitizeSvg } from "./svg"
import type { SvgRefusal } from "./svg"

/**
 * An upload, turned into the bytes we will store.
 *
 * ## Two steps, and the second one rewrites
 *
 * `inspectUpload` in `@checkout-studio/utils` decides whether bytes may be
 * stored at all — the type from its signature, the size against its ceiling,
 * the name. It is pure and shared, and it refuses a vector outright, because
 * an SVG may not be stored as it arrived.
 *
 * This is where that refusal is answered, and where a raster is re-encoded.
 * Both produce a file this server wrote, and everything about the stored asset
 * is then derived from *those* bytes, including the content hash. So two
 * uploads of the same hostile SVG deduplicate to one safe file, and two
 * exports of the same photograph deduplicate even though their EXIF differs.
 *
 * ## `bytes` is the contract
 *
 * The caller stores `bytes`, never what it was handed. For a drawing and for a
 * photograph those now differ — which is what makes "no original upload is
 * ever served" true rather than aspirational. A video, a font and a PDF are
 * stored as they arrived: we decode none of them, so there is no encoder whose
 * output could stand in for the upload, and rewriting a file we cannot read
 * would be guessing.
 *
 * This is the one place a per-kind transform belongs, so that criterion has a
 * single home rather than a step at each call site.
 *
 * See docs/phases.md Phase 14 and docs/security.md § File Upload Security.
 */

export interface AcceptedUpload {
  ok: true
  type: UploadType
  /** The bytes to store. Not necessarily the bytes that arrived. */
  bytes: Uint8Array
  /** Of `bytes`, so deduplication keys the stored file and not the upload. */
  sha256: string
  sizeBytes: number
  fileName: string
  /**
   * What sanitizing took out, for telling the merchant.
   *
   * Empty for a type that needed none. A non-empty list on a logo means it
   * will not look the way it was exported, and the only person who can fix
   * that is the one who exported it.
   */
  removed: readonly string[]
}

export interface RefusedUpload {
  ok: false
  reason: UploadRefusal | SvgRefusal | RasterRefusal
  /** On `too-large`, the ceiling it passed, in bytes. */
  limit?: number
}

export type AcceptResult = AcceptedUpload | RefusedUpload

export interface AcceptInput {
  bytes: Uint8Array
  fileName: string
  limits?: Partial<Record<UploadKind, number>>
  /** Override for `MAX_PIXELS`, the ceiling on a raster's decoded size. */
  maxPixels?: number
}

interface Stored {
  type: UploadType
  bytes: Uint8Array
  /** Of `bytes`. Passed in because whoever produced them has already paid for it. */
  sha256: string
  fileName: string
  removed: readonly string[]
}

/**
 * The accepted shape, built in one place.
 *
 * `sizeBytes` is read off the bytes rather than carried alongside them, so the
 * size recorded against an asset cannot describe a different file than the
 * hash does.
 */
function stored(asset: Stored): AcceptedUpload {
  return {
    ok: true,
    type: asset.type,
    bytes: asset.bytes,
    sha256: asset.sha256,
    sizeBytes: asset.bytes.length,
    fileName: asset.fileName,
    removed: asset.removed,
  }
}

export async function acceptUpload(input: AcceptInput): Promise<AcceptResult> {
  const inspected = inspectUpload(input)

  if (inspected.ok) {
    /*
     * Asking for the encoder is how this decides whether a type is a raster.
     * `raster.ts` holds the list, so there is no second opinion here to drift
     * from it, and a format we cannot re-encode is stored as it arrived rather
     * than quietly handed to a decoder that does not know it.
     */
    const encode = rasterEncoder(inspected.type.mimeType)

    if (encode === null) {
      return stored({
        type: inspected.type,
        bytes: input.bytes,
        sha256: inspected.sha256,
        fileName: inspected.fileName,
        removed: [],
      })
    }

    const image = await reencodeRaster(input.bytes, encode, input.maxPixels)

    if (!image.ok) return { ok: false, reason: image.reason }

    /*
     * Measured again, because the ceiling is about what we store.
     *
     * An encoder can hand back more than it was given — a JPEG somebody had
     * already crushed, written out at a quality we would choose. It is rare,
     * and when it happens the honest answer is that the file we would keep is
     * over the limit, which is what `too-large` says.
     */
    const limit = limitFor(inspected.type.kind, input.limits)

    if (image.bytes.length > limit) return { ok: false, reason: "too-large", limit }

    return stored({
      type: inspected.type,
      bytes: image.bytes,
      sha256: contentHash(image.bytes),
      fileName: inspected.fileName,
      /*
       * Nothing. A raster loses its metadata rather than any of its drawing,
       * and this field exists to warn that a picture will not look as it was
       * exported. Stripping EXIF is the promise, not a surprise.
       */
      removed: [],
    })
  }

  /*
   * Every refusal but one is final. `needs-sanitizing` is the boundary saying
   * it recognised a vector and will not pass it through — which is this
   * function's cue, and the only reason it is a distinct reason at all.
   */
  if (inspected.reason !== "needs-sanitizing") {
    return inspected.limit === undefined
      ? { ok: false, reason: inspected.reason }
      : { ok: false, reason: inspected.reason, limit: inspected.limit }
  }

  const clean = sanitizeSvg(input.bytes)

  if (!clean.ok) return { ok: false, reason: clean.reason }

  /*
   * Measured again, against the document we wrote.
   *
   * Not reusing the inspection: it described bytes that are not the ones being
   * stored. The size can only have gone down, so the ceiling it already
   * cleared still holds — but the hash must be of what is stored, or the
   * deduplication key would name a file nobody has.
   */
  return stored({
    type: SVG_TYPE,
    bytes: clean.bytes,
    sha256: contentHash(clean.bytes),
    fileName: input.fileName.trim(),
    removed: clean.removed,
  })
}
