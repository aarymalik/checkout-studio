import "server-only"

import { DraftConflictError, pageRepository, type TenantContext } from "@checkout-studio/database"
import {
  parseDocument,
  serialize,
  validateReferences,
  type CheckoutSchema,
  type SchemaProblem,
} from "@checkout-studio/schema"
/*
 * A default import, destructured.
 *
 * `fast-json-patch` declares no `exports` map, so Node ignores its ESM entry
 * and loads the CommonJS bundle — whose named exports its lexer cannot see.
 * A named import works under a bundler and throws in plain Node, which is how
 * the Studio's whole end-to-end suite came to be unrunnable without anybody
 * noticing: Playwright loads these modules directly.
 */
import jsonpatch from "fast-json-patch"
import type { Operation } from "fast-json-patch"

const { applyPatch } = jsonpatch

/**
 * Writing the draft.
 *
 * There is no unconditional write path. Every write carries the version it was
 * made against, and the check-and-increment happens inside the same transaction
 * as the update, so two sessions cannot both believe they won.
 *
 * A patch that would produce an invalid tree is refused before anything is
 * stored. The alternative is a page that cannot be opened, which is a far worse
 * outcome than a rejected save.
 *
 * See docs/api-spec.md § Save Draft and docs/history-versioning.md §
 * Optimistic Concurrency.
 */

export type DraftWriteResult =
  | { ok: true; draftVersion: number; document: CheckoutSchema }
  /**
   * The version moved on.
   *
   * The winning document comes back with it, because the caller is the only
   * party that can describe the conflict: it still holds the document it
   * started from, and the server does not — a draft write creates no revision,
   * so there is nothing here to reconstruct `baseVersion` from. The editor
   * diffs its own base against both sides to fill in the prompt.
   */
  | { ok: false; reason: "conflict"; currentVersion: number; current: CheckoutSchema }
  /** The patch applied cleanly and produced something that is not a page. */
  | { ok: false; reason: "invalid"; problems: readonly SchemaProblem[] }
  /** The patch itself was malformed, or pointed somewhere that does not exist. */
  | { ok: false; reason: "unpatchable"; message: string }

/** The draft as stored, parsed and checked. */
export async function readDraft(
  tenant: TenantContext,
  pageId: string,
): Promise<{ document: CheckoutSchema; draftVersion: number } | null> {
  const page = await pageRepository.findById(tenant, pageId)

  if (page === null) return null

  const parsed = parseDocument(page.draftSchema)

  // A draft that does not parse is a stored document we cannot read. Saying so
  // is better than handing the editor something it will corrupt further.
  if (!parsed.ok) return null

  return { document: parsed.document, draftVersion: page.draftVersion }
}

/**
 * Apply a JSON Patch to the draft.
 *
 * The patch is the wire format because only changed data is worth sending: one
 * text edit on a large page is a few dozen bytes rather than half a megabyte,
 * per docs/performance.md.
 */
export async function saveDraft(
  tenant: TenantContext,
  pageId: string,
  input: { baseVersion: number; patch: readonly Operation[] },
): Promise<DraftWriteResult> {
  const stored = await readDraft(tenant, pageId)

  if (stored === null) {
    return { ok: false, reason: "unpatchable", message: "There is no draft to write." }
  }

  let patched: CheckoutSchema

  try {
    // `false` for mutateDocument: the stored document must survive being patched
    // so it can still be described if the write turns out to conflict.
    patched = applyPatch(stored.document, [...input.patch], true, false).newDocument
  } catch (error) {
    return {
      ok: false,
      reason: "unpatchable",
      message: error instanceof Error ? error.message : "The patch could not be applied.",
    }
  }

  const parsed = parseDocument(patched)

  if (!parsed.ok) return { ok: false, reason: "invalid", problems: parsed.errors }

  const problems = validateReferences(parsed.document)

  if (problems.length > 0) return { ok: false, reason: "invalid", problems }

  try {
    const saved = await pageRepository.saveDraft(
      tenant,
      pageId,
      input.baseVersion,
      JSON.parse(serialize(parsed.document)) as object,
    )

    // Null means the page went between the read and the write — deleted in
    // another tab, most often. There is nothing to conflict with and nothing
    // to write.
    if (saved === null) {
      return { ok: false, reason: "unpatchable", message: "This page no longer exists." }
    }

    return { ok: true, draftVersion: saved.draftVersion, document: parsed.document }
  } catch (error) {
    if (!(error instanceof DraftConflictError)) throw error

    // Re-read rather than trusting what we fetched a moment ago: the winning
    // write landed between the two, and its document is what the person has to
    // choose against.
    const now = await readDraft(tenant, pageId)

    return {
      ok: false,
      reason: "conflict",
      currentVersion: now?.draftVersion ?? input.baseVersion + 1,
      current: now?.document ?? stored.document,
    }
  }
}
