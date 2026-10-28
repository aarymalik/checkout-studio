import { createHash } from "node:crypto"

import { SVG_TYPE, looksLikeSvg, signatureOf } from "./signatures"
import type { UploadKind, UploadType } from "./signatures"

/**
 * Whether these bytes may be stored at all.
 *
 * The one gate in front of the asset pipeline. Everything after it — hashing
 * for deduplication, optimisation, serving — assumes the bytes are a type we
 * chose to accept and small enough to work on, and this is where that becomes
 * true.
 *
 * It answers from the bytes and the name, and nothing else. In particular it
 * takes no declared content type: a client-supplied media type is precisely
 * the value that must not be trusted, and a parameter holding it would be a
 * parameter somebody later believes. The type recorded against an asset is
 * always the one the signature matched.
 *
 * See docs/security.md § File Upload Security and § Image Security.
 */

export type UploadRefusal =
  /** No bytes. A cancelled upload, or a form field that was never filled. */
  | "empty"
  /** The bytes match no permitted type. An executable arrives here. */
  | "unrecognised"
  /** Past the ceiling for its kind. */
  | "too-large"
  /** The name is not a name: a path, a traversal, or a control character. */
  | "unsafe-name"
  /** An SVG, and nothing yet can sanitize one. */
  | "needs-sanitizing"

export interface UploadAccepted {
  ok: true
  type: UploadType
  /** Lowercase hex sha256 of the bytes. The deduplication key. */
  sha256: string
  sizeBytes: number
  /**
   * The name, for showing in the library.
   *
   * A label and nothing more. The stored object's key is built from the hash,
   * so nothing downstream reads this to decide where bytes go.
   */
  fileName: string
}

export interface UploadRefused {
  ok: false
  reason: UploadRefusal
  /** On `too-large`, the ceiling it passed, in bytes. */
  limit?: number
}

export type UploadInspection = UploadAccepted | UploadRefused

const MB = 1_000_000

/**
 * The ceilings, per kind.
 *
 * docs/security.md says "maximum size: configurable", so these are the
 * defaults rather than the rule, and `inspectUpload` takes an override.
 *
 * They are not a quota. A plan's `storageBytes` is checked by `assertCan`
 * against what the project already holds, which is a different question asked
 * at a different time — the free plan's whole allowance is 100 MB, so one
 * video at this ceiling would fill it, and that is the entitlement's refusal
 * to make and not this one's.
 */
export const DEFAULT_LIMITS: Readonly<Record<UploadKind, number>> = {
  image: 10 * MB,
  // An SVG is text that describes drawing. One this size is generated, not
  // drawn, and is usually a traced photograph that should have been a raster.
  vector: 1 * MB,
  video: 100 * MB,
  font: 2 * MB,
  document: 20 * MB,
}

/**
 * The ceiling for a kind, with any override applied.
 *
 * One expression, in one place, because `acceptUpload` checks the ceiling a
 * second time against the bytes it re-encoded and the two checks have to agree
 * about what an override means.
 */
export function limitFor(kind: UploadKind, limits?: Partial<Record<UploadKind, number>>): number {
  return limits?.[kind] ?? DEFAULT_LIMITS[kind]
}

/**
 * Whether a name is a name.
 *
 * A browser's `File.name` is always a bare filename — no browser sends a path
 * — so a separator here means a client nobody wrote, and the honest answer is
 * to refuse rather than to quietly rewrite it. The merchant sees the name they
 * chose or an error, never a third thing this code invented.
 *
 * It matters less than it looks: the stored key comes from the content hash,
 * so a traversal in a name could not reach a path even if it were kept. This
 * refuses it anyway, because the name is shown to people and later read by
 * code nobody has written yet.
 */
function isSafeName(fileName: string): boolean {
  if (fileName.trim() === "" || fileName.length > 255) return false

  // Both separators, so a Windows path is refused on a Linux server.
  if (/[/\\]/.test(fileName)) return false

  // A segment that walks up, and the two names that mean "here" and "up".
  if (fileName === "." || fileName === "..") return false

  // NUL truncates a string in anything that later hands it to a C library,
  // and the rest cannot be displayed. Includes newlines, which would let a
  // name forge a line in a log.
  // eslint-disable-next-line no-control-regex -- the point is to refuse these
  if (/[\u0000-\u001f\u007f]/.test(fileName)) return false

  return true
}

export interface InspectInput {
  bytes: Uint8Array
  fileName: string
  /** Overrides for `DEFAULT_LIMITS`, per kind. */
  limits?: Partial<Record<UploadKind, number>>
}

export function inspectUpload(input: InspectInput): UploadInspection {
  const { bytes, fileName } = input

  if (bytes.length === 0) return { ok: false, reason: "empty" }
  if (!isSafeName(fileName)) return { ok: false, reason: "unsafe-name" }

  /*
   * A signature, or failing that an SVG, which carries none — it is XML, and
   * an XML document announces nothing about what it draws.
   *
   * The two cannot both match, because no permitted signature begins with
   * `<`, so this order is for reading and not for correctness. What keeps a
   * raster image out of the SVG path is that `looksLikeSvg` reads only the
   * head. See its note.
   */
  const matched = signatureOf(bytes)
  const type = matched ?? (looksLikeSvg(bytes) ? SVG_TYPE : null)

  if (type === null) return { ok: false, reason: "unrecognised" }

  const limit = limitFor(type.kind, input.limits)

  // Checked before the SVG refusal, so an oversized SVG is reported as what it
  // is rather than as a sanitizing problem it would never have reached.
  if (bytes.length > limit) return { ok: false, reason: "too-large", limit }

  /*
   * docs/security.md permits "SVG (sanitized)", and there is nothing here to
   * sanitize one with. Refusing says so, and is the safe direction: an SVG
   * carries script, external references and event handlers, and serving one
   * unsanitized from our own origin is a stored cross-site scripting hole on a
   * page that takes card details.
   */
  if (type.kind === "vector") return { ok: false, reason: "needs-sanitizing" }

  return {
    ok: true,
    type,
    sha256: contentHash(bytes),
    sizeBytes: bytes.length,
    fileName: fileName.trim(),
  }
}

/**
 * The content hash, as lowercase hex.
 *
 * sha256 over the bytes exactly as they arrived. It is the deduplication key —
 * `Asset` is unique on `(projectId, sha256)` — so it has to be stable across
 * processes and releases, which is why it is a plain digest of the content and
 * not of anything about the request.
 */
export function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}
