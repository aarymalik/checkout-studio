import {
  authenticate,
  claim,
  currentEditSession,
  heartbeat,
  readDraft,
  release,
  route,
} from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * Edit sessions.
 *
 * One writer per page, until real-time collaboration exists. A second session
 * is never silently blocked and never silently allowed: it is told who holds
 * the page and offered the choice between reading and taking over.
 *
 * See docs/api-spec.md § Edit Sessions.
 */

function pageOf(params: Record<string, string>): string {
  const pageId = params["pageId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

  return pageId
}

/** A client that cannot be identified cannot be told apart from another tab. */
const identity = z.object({
  sessionId: z.string().min(8).max(64),
  clientLabel: z.string().min(1).max(100),
})

export const GET = route({ authenticate }, async ({ params, userId }) => {
  const pageId = pageOf(params)

  // Reading the draft first: a session on a page this tenant cannot see would
  // otherwise report a holder for something they are not allowed to know exists.
  if ((await readDraft({ userId }, pageId)) === null) throw Errors.resource.notFound("Page")

  return { session: await currentEditSession(pageId) }
})

export const POST = route(
  {
    authenticate,
    body: identity,
    rateLimit: { scope: "pages.session.claim", limit: 60, windowSeconds: 60 },
  },
  async ({ body, params, userId }) => {
    const pageId = pageOf(params)
    const draft = await readDraft({ userId }, pageId)

    if (draft === null) throw Errors.resource.notFound("Page")

    const result = await claim({
      pageId,
      sessionId: body.sessionId,
      userId,
      clientLabel: body.clientLabel,
      baseVersion: draft.draftVersion,
    })

    // Not an error. "Somebody else has this open" is an answer the editor acts
    // on by opening read-only, and a 409 would make it a failure to handle.
    return result.held
      ? { held: true, session: result.session, draftVersion: draft.draftVersion }
      : { held: false, holder: result.holder, draftVersion: draft.draftVersion }
  },
)

/**
 * Keep a session alive.
 *
 * Every thirty seconds, against a ninety-second expiry: three chances to miss
 * one before the page becomes claimable again, which covers a slow network
 * without leaving a closed tab holding the page.
 */
export const PUT = route(
  {
    authenticate,
    body: z.object({ sessionId: z.string().min(8).max(64) }),
    rateLimit: { scope: "pages.session.heartbeat", limit: 300, windowSeconds: 60 * 60 },
  },
  async ({ body, params }) => ({
    // False is how a client learns it has lost the page, without being told by
    // anything else.
    held: await heartbeat({ pageId: pageOf(params), sessionId: body.sessionId }),
  }),
)

export const DELETE = route(
  {
    authenticate,
    body: z.object({ sessionId: z.string().min(8).max(64) }),
    rateLimit: { scope: "pages.session.release", limit: 60, windowSeconds: 60 },
  },
  async ({ body, params }) => ({
    released: await release(pageOf(params), body.sessionId),
  }),
)
