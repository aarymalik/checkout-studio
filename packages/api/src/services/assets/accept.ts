import "server-only"

import { SVG_TYPE, contentHash, inspectUpload } from "@checkout-studio/utils"
import type { UploadKind, UploadRefusal, UploadType } from "@checkout-studio/utils"

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
 * This is where that refusal is answered. A vector is sanitized, and what
 * comes back is a document this server wrote; everything about the stored
 * asset is then derived from *those* bytes, including the content hash. So two
 * uploads of the same hostile SVG deduplicate to one safe file, and an upload
 * whose only difference was a `<script>` deduplicates against the clean
 * version of itself.
 *
 * ## `bytes` is the contract
 *
 * The caller stores `bytes`, never what it was handed. For a vector those
 * differ today; for a raster they will once re-encoding lands, which is what
 * strips EXIF and makes "no original upload is ever served" true for images
 * too. This is the one place a per-kind transform belongs, so that criterion
 * has a single home rather than a step at each call site.
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
  reason: UploadRefusal | SvgRefusal
  /** On `too-large`, the ceiling it passed, in bytes. */
  limit?: number
}

export type AcceptResult = AcceptedUpload | RefusedUpload

export interface AcceptInput {
  bytes: Uint8Array
  fileName: string
  limits?: Partial<Record<UploadKind, number>>
}

export function acceptUpload(input: AcceptInput): AcceptResult {
  const inspected = inspectUpload(input)

  if (inspected.ok) {
    return {
      ok: true,
      type: inspected.type,
      bytes: input.bytes,
      sha256: inspected.sha256,
      sizeBytes: inspected.sizeBytes,
      fileName: inspected.fileName,
      removed: [],
    }
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
  return {
    ok: true,
    type: SVG_TYPE,
    bytes: clean.bytes,
    sha256: contentHash(clean.bytes),
    sizeBytes: clean.bytes.length,
    fileName: input.fileName.trim(),
    removed: clean.removed,
  }
}
