import { diff, summarize, type CheckoutSchema } from "@checkout-studio/schema"

/**
 * Describing a conflict.
 *
 * The server cannot do this. A draft write creates no revision, so there is
 * nothing on the server to reconstruct the caller's `baseVersion` from — only
 * the session that made the edits still holds the document it started from.
 *
 * So the server returns the document that won, and this turns the three
 * documents into the two sentences the prompt shows.
 *
 * See docs/history-versioning.md § Conflict Resolution.
 */

export interface ConflictSummary {
  /** What the other session did, since the version both sides started from. */
  theirChanges: string
  /** What this session did over the same span. */
  yourChanges: string
  /** Whether the two sides actually touched the same nodes. */
  overlapping: readonly string[]
}

export function describeConflict(input: {
  /** The document as it was when this session last agreed with the server. */
  base: CheckoutSchema
  /** What this session has now. */
  mine: CheckoutSchema
  /** The document the server kept. */
  theirs: CheckoutSchema
}): ConflictSummary {
  const ours = diff(input.base, input.mine)
  const others = diff(input.base, input.theirs)

  const mineTouched = new Set([...ours.added, ...ours.removed, ...ours.changed])

  return {
    theirChanges: summarize(others),
    yourChanges: summarize(ours),
    // Not used to decide anything automatically — deciding is the person's job.
    // It is what lets the prompt say whether the two sides are even about the
    // same part of the page.
    overlapping: [...others.added, ...others.removed, ...others.changed].filter((id) =>
      mineTouched.has(id),
    ),
  }
}
