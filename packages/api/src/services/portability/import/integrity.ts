import "server-only"

import { checksumOf } from "../checksum"
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from "../types"
import type { Bundle, BundleManifest } from "../types"

/**
 * The first gate an uploaded bundle passes, and the only one that reads bytes
 * it does not yet trust.
 *
 * docs/export-import.md states the order and that no stage may be skipped:
 * integrity, then the manifest, then compatibility, then the schema. This is
 * the first two — is it a bundle at all, and is it the bundle it claims to
 * be — because every later stage is entitled to assume the answer is yes.
 *
 * ## Every refusal names itself
 *
 * A bundle that will not import is a file somebody made, and "invalid bundle"
 * tells them nothing about which of five things to go and fix. The reasons
 * are a closed set so that a caller can say something useful about each
 * without parsing a sentence.
 *
 * ## Nothing is partially applied
 *
 * A refusal returns no bundle at all. The exit criterion is that a bundle
 * from a newer version is "rejected, never partially applied", and the way to
 * be sure of that is for the stage that could do it to have nothing to hand
 * on.
 */

export type IntegrityRefusal =
  /** Not JSON. */
  | "unreadable"
  /** JSON, but not shaped like a bundle. */
  | "not-a-bundle"
  /** A bundle whose envelope this product is too old to read. */
  | "unsupported-format"
  /** The payload is not what the manifest says it is. */
  | "checksum-mismatch"

export type IntegrityResult =
  { ok: true; bundle: Bundle } | { ok: false; reason: IntegrityRefusal; message: string }

/** Reads a `.checkout.json`, and says no rather than guessing. */
export function readJsonBundle(text: string): IntegrityResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    return refuse("unreadable", "This file is not JSON.")
  }

  const candidate = parsed as { manifest?: unknown; payload?: unknown } | null

  if (candidate === null || typeof candidate !== "object") {
    return refuse("not-a-bundle", "This file does not contain a bundle.")
  }

  const manifest = candidate.manifest as BundleManifest | undefined

  if (manifest?.format !== BUNDLE_FORMAT) {
    return refuse("not-a-bundle", "This file does not contain a Checkout Studio bundle.")
  }

  const payload = candidate.payload

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return refuse("not-a-bundle", "This bundle carries nothing.")
  }

  /*
   * The envelope's version, not the schema's. A document written against an
   * older schema is migrated on import; an *envelope* this product cannot
   * read is refused, because the thing that would do the migrating is the
   * thing that cannot read it.
   */
  if (!readableFormat(manifest.formatVersion)) {
    return refuse(
      "unsupported-format",
      `This bundle was made by a newer version of Checkout Studio (format ${String(manifest.formatVersion)}).`,
    )
  }

  if (checksumOf(payload) !== manifest.checksum) {
    return refuse("checksum-mismatch", "This bundle has been changed or did not arrive intact.")
  }

  return { ok: true, bundle: { manifest, payload: payload as Bundle["payload"] } }
}

/**
 * Whether this product can read an envelope of that version.
 *
 * Major only, and a missing or malformed version is refused rather than
 * assumed to be the current one: a file that cannot say what it is has not
 * said it is readable.
 */
function readableFormat(version: unknown): boolean {
  if (typeof version !== "string") return false

  const major = Number(version.split(".")[0])
  const ours = Number(BUNDLE_FORMAT_VERSION.split(".")[0])

  return Number.isInteger(major) && major <= ours
}

function refuse(reason: IntegrityRefusal, message: string): IntegrityResult {
  return { ok: false, reason, message }
}
