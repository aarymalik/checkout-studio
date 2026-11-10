import "server-only"

import { canonicalText } from "@checkout-studio/schema"
import { contentHash } from "@checkout-studio/utils"

/**
 * The integrity of a bundle, as one number over its payload.
 *
 * ## Over the payload, never over the manifest
 *
 * The checksum lives *in* the manifest, so a checksum over the manifest would
 * have to exclude itself — and "everything except this field" is a rule two
 * implementations will eventually disagree about. The payload is what a
 * corrupt transfer damages and what a tampered bundle rewrites; the manifest
 * is read first and judged on its own terms.
 *
 * ## Canonical, so key order is not a difference
 *
 * Two exports of the same page that differ only in the order an object was
 * built are the same bundle, and a hash that said otherwise would make the
 * round trip the phase asks for impossible to prove.
 */
export function checksumOf(payload: unknown): string {
  return contentHash(new TextEncoder().encode(canonicalText(payload)))
}
