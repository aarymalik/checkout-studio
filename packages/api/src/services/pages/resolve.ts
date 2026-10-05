import "server-only"

import { pageRepository, revisionRepository, DraftConflictError } from "@checkout-studio/database"
import { parseDocument, serialize, validateReferences } from "@checkout-studio/schema"
import type { CheckoutSchema, SchemaProblem } from "@checkout-studio/schema"
import { RENDERER_VERSION } from "@checkout-studio/types"
import type { TenantContext } from "@checkout-studio/database"

import { readDraft } from "./draft"
import { resolveTheme } from "./theme"

/**
 * Resolving a draft conflict.
 *
 * The one sanctioned way past the version check. Every ordinary write carries
 * the version it was made against and there is no unconditional path — but a
 * conflict is exactly the case where somebody has looked at both sides and
 * chosen, and that choice has to be able to land.
 *
 * **No resolution path discards work.** Whichever side is not kept is written
 * as a `recovery` revision *before* anything is overwritten, and in that order
 * for a reason: a snapshot that fails leaves a draft unchanged and an extra
 * revision, which is harmless, while a draft overwritten before its snapshot
 * exists is somebody's afternoon.
 *
 * Recovery revisions are retained indefinitely and are exempt from every plan's
 * snapshot limit, like published ones.
 *
 * See docs/history-versioning.md § Conflict Resolution.
 */

export type Resolution = "mine" | "theirs"

export type ResolveResult =
  /**
   * Resolved.
   *
   * `document` is what the editor should now hold and `draftVersion` what its
   * next write must carry — for "theirs" that is the other session's document,
   * which the editor has to load rather than keep its own.
   */
  | { ok: true; document: CheckoutSchema; draftVersion: number; recoveryRevisionId: string }
  /**
   * A third write landed while this was being decided.
   *
   * Rare, and not an error: the prompt simply has to be asked again against the
   * version that won. Nothing has been overwritten.
   */
  | { ok: false; reason: "conflict"; currentVersion: number }
  | { ok: false; reason: "invalid"; problems: readonly SchemaProblem[] }
  | { ok: false; reason: "missing"; message: string }

/** "Replaced in conflict — 5 Oct 2026, 14:22". Dated, because it will be read later. */
function revisionName(resolution: Resolution, at: Date): string {
  const when = at.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${resolution === "mine" ? "Replaced" : "Discarded"} in conflict — ${when}`
}

export async function resolveConflict(
  tenant: TenantContext,
  pageId: string,
  input: { resolution: Resolution; document: unknown; now?: Date },
): Promise<ResolveResult> {
  const stored = await readDraft(tenant, pageId)

  if (stored === null) {
    return { ok: false, reason: "missing", message: "This page no longer exists." }
  }

  /*
   * The caller's document is validated even when it is the side being thrown
   * away.
   *
   * It is about to be stored as a revision somebody may restore, and a recovery
   * snapshot that cannot be opened is not a recovery.
   */
  const parsed = parseDocument(input.document)

  if (!parsed.ok) return { ok: false, reason: "invalid", problems: parsed.errors }

  const problems = validateReferences(parsed.document)

  if (problems.length > 0) return { ok: false, reason: "invalid", problems }

  const mine = parsed.document
  const theirs = stored.document

  // The side that is not kept. For "mine" that is what the server holds; for
  // "theirs" it is what this editor has been carrying.
  const losing = input.resolution === "mine" ? theirs : mine
  const at = input.now ?? new Date()

  const revision = await revisionRepository.create(tenant, {
    pageId,
    kind: "recovery",
    name: revisionName(input.resolution, at),
    schema: JSON.parse(serialize(losing)) as object,
    // Snapshotted, unlike the editor's live resolution: a revision has to
    // render as it did, and a later theme edit must not change it.
    theme: (await resolveTheme(losing.projectId, losing.theme)) as unknown as object,
    schemaVersion: losing.version,
    rendererVersion: RENDERER_VERSION,
    createdBy: tenant.userId,
  })

  if (revision === null) {
    return { ok: false, reason: "missing", message: "This page no longer exists." }
  }

  /*
   * Keeping theirs needs no write.
   *
   * Their document is already the draft. The snapshot above is the whole
   * operation, and the editor loads what comes back.
   */
  if (input.resolution === "theirs") {
    return {
      ok: true,
      document: theirs,
      draftVersion: stored.draftVersion,
      recoveryRevisionId: revision.id,
    }
  }

  try {
    const saved = await pageRepository.saveDraft(
      tenant,
      pageId,
      // Against the version just read, so this is still a checked write. A
      // third session that wrote in between is told, rather than overwritten.
      stored.draftVersion,
      JSON.parse(serialize(mine)) as object,
    )

    if (saved === null) {
      return { ok: false, reason: "missing", message: "This page no longer exists." }
    }

    return {
      ok: true,
      document: mine,
      draftVersion: saved.draftVersion,
      recoveryRevisionId: revision.id,
    }
  } catch (error) {
    if (!(error instanceof DraftConflictError)) throw error

    const now = await readDraft(tenant, pageId)

    return {
      ok: false,
      reason: "conflict",
      currentVersion: now?.draftVersion ?? stored.draftVersion + 1,
    }
  }
}
