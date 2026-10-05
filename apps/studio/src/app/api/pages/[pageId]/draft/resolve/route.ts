import { authenticate, resolveConflict, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * Resolving a draft conflict.
 *
 * The one sanctioned way past the version check. Every ordinary write carries
 * the version it was made against and there is no unconditional path — but a
 * conflict is precisely the case where somebody has seen both sides and
 * chosen, and that choice has to be able to land.
 *
 * The document arrives whole rather than as a patch, because there is no agreed
 * base to patch against: that disagreement is what a conflict is.
 *
 * No path discards work. Whichever side is not kept becomes a `recovery`
 * revision before anything is overwritten.
 *
 * See docs/history-versioning.md § Conflict Resolution.
 */
export const POST = route(
  {
    authenticate,
    body: z.object({
      resolution: z.enum(["mine", "theirs"]),
      /*
       * Sent for either choice.
       *
       * Keeping theirs still needs this: the losing side is snapshotted as a
       * revision somebody may restore, and the server has never seen it.
       */
      document: z.unknown(),
    }),
    // Low on purpose. A person resolves a conflict at human speed, and a client
    // looping on this endpoint would be writing revisions without limit.
    rateLimit: { scope: "pages.draft.resolve", limit: 30, windowSeconds: 60 * 60 },
  },
  async ({ body, params, userId }) => {
    const pageId = params["pageId"]

    if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

    const result = await resolveConflict({ userId }, pageId, {
      resolution: body.resolution,
      document: body.document,
    })

    if (result.ok) {
      return {
        schema: result.document,
        draftVersion: result.draftVersion,
        recoveryRevisionId: result.recoveryRevisionId,
      }
    }

    // A third write landed while this was being decided. Not an error: the
    // prompt is asked again against the version that won, and nothing has been
    // overwritten.
    if (result.reason === "conflict") throw Errors.resource.draftConflict(result.currentVersion)

    if (result.reason === "missing") throw Errors.resource.notFound("Page")

    throw Errors.validation.invalidInput(
      result.problems.map((problem) => ({
        path: problem.path ?? problem.nodeIds.join(", "),
        code: problem.code,
        message: problem.message,
      })),
    )
  },
)
