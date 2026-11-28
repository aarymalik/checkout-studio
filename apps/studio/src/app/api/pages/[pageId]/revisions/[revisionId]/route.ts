import { authenticate, restoreRevision, rollbackPage, route } from "@checkout-studio/api"
import { DraftConflictError } from "@checkout-studio/database"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

import { ENGINE_VERSION, registry } from "@/studio/registry"

/**
 * Going back to one revision, in the two ways that means something.
 *
 * `PATCH` restores it into the draft and shows nobody. `PUT` rolls back —
 * the same thing, then published. One resource and two verbs, because the
 * difference is what happens to the live page and not what is being named.
 *
 * ## A conflict is answered, not raised
 *
 * Both write the draft with the version the caller was holding, so both
 * can lose a race with somebody else's editing. `restoreRevision` lets
 * that through as a `DraftConflictError` deliberately — it is the same
 * collision any save has — and HTTP is where it becomes an answer.
 *
 * `draftConflict` and not the general `conflict`, because the catalog
 * already has one for this and it carries the version that won in its
 * details. The client has to re-read the draft anyway; being told which
 * version to expect is what turns a refusal into an instruction.
 */

const body = z.object({ baseVersion: z.number().int().nonnegative() })

function idsOf(params: Record<string, string>): { pageId: string; revisionId: string } {
  const pageId = params["pageId"]
  const revisionId = params["revisionId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")
  if (revisionId === undefined || revisionId === "") throw Errors.resource.notFound("Revision")

  return { pageId, revisionId }
}

/** What every failure here turns into, shared by both verbs. */
function refuse(reason: "not-found" | "unreadable"): never {
  if (reason === "not-found") throw Errors.resource.notFound("Revision")

  throw Errors.validation.invalidInput([
    {
      path: "revisionId",
      code: "unreadable",
      message: "This version cannot be read by this release, so it cannot be used.",
    },
  ])
}

/**
 * Runs a draft write, turning a lost race into something a client can act
 * on rather than a five hundred.
 */
async function writing<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (!(error instanceof DraftConflictError)) throw error

    throw Errors.resource.draftConflict(error.actualVersion)
  }
}

export const PATCH = route(
  {
    authenticate,
    rateLimit: { scope: "pages.revisions.restore", limit: 60, windowSeconds: 60 * 60 },
    body,
  },
  async ({ body: input, params, userId }) => {
    const { pageId, revisionId } = idsOf(params)
    const result = await writing(() =>
      restoreRevision({ userId }, { pageId, revisionId, baseVersion: input.baseVersion }),
    )

    if (!result.ok) refuse(result.reason)

    return { draftVersion: result.draftVersion }
  },
)

export const PUT = route(
  {
    authenticate,
    rateLimit: { scope: "pages.revisions.rollback", limit: 60, windowSeconds: 60 * 60 },
    body,
  },
  async ({ body: input, params, userId }) => {
    const { pageId, revisionId } = idsOf(params)
    const result = await writing(() =>
      rollbackPage(
        { userId },
        {
          pageId,
          revisionId,
          baseVersion: input.baseVersion,
          validators: registry.documentValidators(),
          rendererVersion: ENGINE_VERSION,
        },
      ),
    )

    if (result.ok) {
      return {
        revision: { id: result.revisionId, number: result.revisionNumber },
        created: result.created,
        warnings: result.warnings,
      }
    }

    if (result.reason !== "blocked") refuse(result.reason)

    /*
     * Restored into the draft and refused by today's rules. The content is
     * there to be fixed, so these are the same field-level problems a
     * publish reports, said about the same nodes.
     */
    throw Errors.validation.invalidInput(
      result.issues.map((issue) => ({
        path: issue.nodeIds[0] ?? "page",
        code: issue.rule,
        message: issue.message,
      })),
    )
  },
)
