import "server-only"

import { pageRepository, revisionRepository, type TenantContext } from "@checkout-studio/database"
import { parseDocument } from "@checkout-studio/schema"

import { revisionContent } from "./content"

/**
 * A version a merchant made on purpose, with a name on it.
 *
 * docs/phases.md Phase 16 step 7. Publishing writes a revision as a side
 * effect of going live; this writes one as the whole point — "before I
 * redo the hero", kept so there is something to go back to that is not
 * simply "whatever was live last Tuesday".
 *
 * Restoring and rolling back take any revision of the page, so a named
 * snapshot becomes a place to return to without either of them learning
 * what a snapshot is.
 *
 * ## It does not validate
 *
 * Publishing refuses a page that cannot go live, and that is right: it is
 * about to face customers. A snapshot faces nobody. Refusing to let
 * somebody bookmark work in progress because the work is in progress
 * would make the feature useless exactly when it is most wanted — before
 * a large change, which is when a page is least likely to be publishable.
 *
 * The draft still has to parse, because a revision nobody can read is not
 * a place anybody can return to.
 *
 * ## Two snapshots of the same content are two snapshots
 *
 * Publishing the same thing twice writes one revision, because the second
 * would differ only in its timestamp. A name is not a timestamp: "before
 * the rewrite" and "known good" can mean different things about identical
 * content, and which one a merchant wants back is theirs to say.
 *
 * The hash is stored anyway, so a history panel can tell a reader that
 * two entries hold the same page.
 */

/** Long enough to say why, short enough to read in a list. */
const MAX_NAME = 80

export type SnapshotOutcome =
  | { ok: true; revisionId: string; revisionNumber: number }
  /** No such page, or not one this caller owns. */
  | { ok: false; reason: "not-found" }
  /** The draft cannot be read, so there is nothing worth keeping. */
  | { ok: false; reason: "unreadable" }
  /** A snapshot with no name is a snapshot nobody will recognise later. */
  | { ok: false; reason: "unnamed" }

export interface SnapshotInput {
  pageId: string
  name: string
  /** The renderer build this snapshot was taken against. */
  rendererVersion: string
}

export async function snapshotPage(
  tenant: TenantContext,
  input: SnapshotInput,
): Promise<SnapshotOutcome> {
  const name = input.name.trim().slice(0, MAX_NAME)

  if (name === "") return { ok: false, reason: "unnamed" }

  const page = await pageRepository.findById(tenant, input.pageId)

  if (page === null) return { ok: false, reason: "not-found" }

  const parsed = parseDocument(page.draftSchema)

  if (!parsed.ok) return { ok: false, reason: "unreadable" }

  const content = await revisionContent(tenant, parsed.document, input.rendererVersion)

  /*
   * `create` and not `publish`. It becomes the page's current revision,
   * which it is, and does not become the one the world is served — taking
   * a snapshot is not a way to deploy by accident.
   */
  const revision = await revisionRepository.create(tenant, {
    pageId: input.pageId,
    kind: "manual",
    name,
    ...content,
    rendererVersion: input.rendererVersion,
    createdBy: tenant.userId,
  })

  if (revision === null) return { ok: false, reason: "not-found" }

  return { ok: true, revisionId: revision.id, revisionNumber: revision.number }
}
