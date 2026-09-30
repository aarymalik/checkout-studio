import { authenticate, readDraft, route, takeover } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * Taking a page from whoever holds it.
 *
 * The transfer is unconditional; what makes it safe is the order around it. The
 * losing session is notified and flushes its pending autosave before the lock
 * moves, so a takeover can never discard unsaved work.
 *
 * That ordering lives in the client — this endpoint is the moment the lock
 * changes hands, and nothing here can make the other browser flush. What
 * protects the losing session if it never does is the same thing that protects
 * everything else: its next write carries a stale version and is refused rather
 * than applied, and it keeps its work in memory to save as a recovery snapshot.
 *
 * See docs/history-versioning.md § Takeover.
 */
export const POST = route(
  {
    authenticate,
    body: z.object({
      sessionId: z.string().min(8).max(64),
      clientLabel: z.string().min(1).max(100),
    }),
    rateLimit: { scope: "pages.session.takeover", limit: 20, windowSeconds: 60 * 60 },
  },
  async ({ body, params, userId }) => {
    const pageId = params["pageId"]

    if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

    const draft = await readDraft({ userId }, pageId)

    if (draft === null) throw Errors.resource.notFound("Page")

    const session = await takeover({
      pageId,
      sessionId: body.sessionId,
      userId,
      clientLabel: body.clientLabel,
      baseVersion: draft.draftVersion,
    })

    return { session, draftVersion: draft.draftVersion }
  },
)
