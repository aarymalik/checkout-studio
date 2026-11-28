import "server-only"

import type { TenantContext } from "@checkout-studio/database"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"

import { publishPage } from "./publish"
import { restoreRevision } from "./restore"

/**
 * Putting an old version back in front of customers.
 *
 * docs/phases.md Phase 16 step 8, and the end-to-end expectation it is
 * written against: "Rollback → previous content served, original revision
 * intact."
 *
 * ## It is restore and then publish, and that is not a shortcut
 *
 * Rolling back is not a special kind of write. It is the content of an old
 * revision becoming the draft, and the draft going live — which is what a
 * merchant would do by hand if they had the patience, and what makes the
 * result indistinguishable from any other publish.
 *
 * Two things fall out of composing rather than reimplementing, and both
 * are the behaviour we would have wanted anyway.
 *
 * The old revision is untouched and a *new* one is written, so the version
 * rolled back from is still there to roll forward to. Nothing about going
 * back is destructive, which is the only thing that makes going back safe
 * to offer.
 *
 * And rolling back to the version already live does nothing at all. The
 * restored draft hashes to what is published, so the publish recognises it
 * and writes no revision — a merchant who pressed the wrong row has not
 * filled their history with a duplicate.
 *
 * ## Today's rules apply to yesterday's page
 *
 * The publish validates, which means a revision that was publishable when
 * it was written can be refused now — a rule added since, or an asset
 * deleted since. That is correct: the question is whether this content can
 * go live today, not whether it could once.
 *
 * When that happens the content is left in the draft. The merchant asked
 * for that version back and they have it, with the reason it cannot go
 * out; the alternative is refusing and leaving them nothing to fix.
 */

export type RollbackOutcome =
  | {
      ok: true
      /** The new revision, or the live one when it was already serving this. */
      revisionId: string
      revisionNumber: number
      /** False when the page was already serving exactly this. */
      created: boolean
      warnings: readonly ValidationIssue[]
    }
  /** No such page or revision, or not this caller's, or not this page's. */
  | { ok: false; reason: "not-found" }
  /** There is a revision and this release cannot read it. */
  | { ok: false; reason: "unreadable" }
  /** Restored into the draft, and today's rules will not let it go live. */
  | { ok: false; reason: "blocked"; issues: readonly ValidationIssue[] }

export interface RollbackInput {
  pageId: string
  revisionId: string
  /** The draft version the caller was looking at. See `saveDraft`. */
  baseVersion: number
  validators: readonly DocumentValidatorRegistration[]
  rendererVersion: string
}

export async function rollbackPage(
  tenant: TenantContext,
  input: RollbackInput,
): Promise<RollbackOutcome> {
  const restored = await restoreRevision(tenant, {
    pageId: input.pageId,
    revisionId: input.revisionId,
    baseVersion: input.baseVersion,
  })

  if (!restored.ok) return restored

  return publishPage(tenant, {
    pageId: input.pageId,
    validators: input.validators,
    rendererVersion: input.rendererVersion,
  })
}
