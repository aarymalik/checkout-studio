import "server-only"

import { canonicalText } from "@checkout-studio/schema"

import type { Bundle } from "../../types"

/**
 * A bundle as the `.checkout.json` file somebody sends.
 *
 * Canonical, which is what makes the round trip provable: exporting the same
 * thing twice produces the same bytes, so "did this change?" is a string
 * comparison rather than a diff somebody has to read.
 *
 * Not pretty-printed. A bundle is a transfer format — the thing that reads it
 * is an importer, and the thing that stores it is a file. Indentation would
 * be bytes spent on a reader that does not exist, and two products
 * disagreeing about how much of it to write would break byte equality for a
 * reason that has nothing to do with the contents.
 */
export function toJsonBundle(bundle: Bundle): string {
  return canonicalText(bundle)
}
