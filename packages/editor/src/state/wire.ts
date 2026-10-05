/*
 * `fast-json-patch` declares no `exports` map, so Node ignores its ESM entry
 * and loads the CommonJS bundle, whose named exports its lexer cannot see. The
 * default import is the whole module; destructuring it is what works in both
 * the bundler and the test runner.
 */
import jsonpatch from "fast-json-patch"
import type { Operation } from "fast-json-patch"
import type { CheckoutSchema } from "@checkout-studio/schema"

const { compare } = jsonpatch

/**
 * The wire format for a draft write.
 *
 * The API takes an RFC 6902 patch against the version it is answering for, and
 * has no unconditional write path — docs/api-spec.md § Save Draft. So a save is
 * never "here is the document", it is "here is what changed since the version
 * you gave me", and something has to turn two documents into that.
 *
 * Computed by comparing rather than by collecting: the store's history already
 * holds Immer patches, but they are grouped, capped at fifty and inverted by
 * undo, so reconstructing "everything since the last save" from them is a
 * different and much easier problem to get wrong. Two documents and a compare
 * have no state to drift.
 *
 * See docs/state-management.md § Autosave.
 */

export type { Operation }

/** The largest patch the API accepts. Beyond this the edit is a replacement. */
export const MAXIMUM_PATCH_OPERATIONS = 5_000

export interface WirePatch {
  operations: readonly Operation[]
  /**
   * Whether the patch is too large for the API to accept.
   *
   * Not an error here. The caller decides what to do about it, and knowing
   * before the request goes out is better than learning from a rejection.
   */
  tooLarge: boolean
}

/**
 * What changed between two documents, as operations.
 *
 * An empty list means the documents are the same, which is the ordinary case on
 * a page somebody is reading rather than editing — and the API refuses an empty
 * patch, so the caller has to notice.
 */
export function patchBetween(base: CheckoutSchema, next: CheckoutSchema): WirePatch {
  // Cast because the library is typed for plain objects and a schema is one;
  // `compare` neither mutates nor retains either argument.
  const operations = compare(
    base as unknown as Record<string, unknown>,
    next as unknown as Record<string, unknown>,
  )

  return {
    operations,
    tooLarge: operations.length > MAXIMUM_PATCH_OPERATIONS,
  }
}
