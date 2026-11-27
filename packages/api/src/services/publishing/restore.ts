import "server-only"

import { pageRepository, revisionRepository, type TenantContext } from "@checkout-studio/database"
import { deserialize, serialize } from "@checkout-studio/schema"

/**
 * Putting an old revision back into the editor.
 *
 * docs/phases.md Phase 16: "Rollback (clone to a new draft, never
 * overwrite)". This is the clone. Nothing in history moves, nothing is
 * rewritten, and what the world is being served does not change — the
 * revision's content lands in the draft and the merchant decides what
 * happens next.
 *
 * That separation is the point. Restoring is not a deployment, and a
 * merchant looking at an old version should be able to look at it, change
 * their mind, and leave without having shown it to anybody.
 *
 * ## It is an ordinary draft write
 *
 * Through `saveDraft` with the version the caller was holding, so it
 * collides with somebody else's editing exactly as any other save would.
 * Restoring is a large change to a document and the worst one to lose
 * silently.
 *
 * ## The theme is not restored with it
 *
 * The revision carries the theme it was published with, and that theme
 * belongs to the project rather than to this page. Writing it back would
 * change every other page in the project because somebody restored one of
 * them, which is not what they asked for.
 *
 * ## A revision is read, never trusted
 *
 * Through `deserialize` rather than used as it lies. A revision may have
 * been written by an older release against an older schema, and the point
 * at which that becomes visible should be here — where it can be reported
 * — rather than in the editor, which would open on something it cannot
 * parse.
 */

export type RestoreOutcome =
  | { ok: true; draftVersion: number }
  /** No such page or revision, or not this caller's, or not this page's. */
  | { ok: false; reason: "not-found" }
  /** There is a revision and this release cannot read it. */
  | { ok: false; reason: "unreadable" }

export interface RestoreInput {
  pageId: string
  revisionId: string
  /** The draft version the caller was looking at. See `saveDraft`. */
  baseVersion: number
}

export async function restoreRevision(
  tenant: TenantContext,
  input: RestoreInput,
): Promise<RestoreOutcome> {
  const revision = await revisionRepository.findById(tenant, input.revisionId)

  /*
   * Belonging to this page as well as to this caller. A revision id from
   * another of their own pages would otherwise write that page's content
   * into this one, which is a sentence nobody would write on purpose and
   * exactly what a copied URL does by accident.
   */
  if (revision === null || revision.pageId !== input.pageId) {
    return { ok: false, reason: "not-found" }
  }

  const read = deserialize(revision.schema)

  if (!read.ok) return { ok: false, reason: "unreadable" }

  const saved = await pageRepository.saveDraft(
    tenant,
    input.pageId,
    input.baseVersion,
    JSON.parse(serialize(read.document)) as object,
  )

  // Null only if the page stopped being this caller's since the revision
  // was read a moment ago.
  if (saved === null) return { ok: false, reason: "not-found" }

  return { ok: true, draftVersion: saved.draftVersion }
}
