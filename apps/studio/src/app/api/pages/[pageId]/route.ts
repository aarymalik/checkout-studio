import { authenticate, deletePage, renamePage, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

import { TITLE_MAXIMUM } from "../../projects/[projectId]/pages/route"

/** One page: rename it, or delete it. */

function pageOf(params: Record<string, string>): string {
  const pageId = params["pageId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

  return pageId
}

export const PATCH = route(
  {
    authenticate,
    body: z.object({ title: z.string().trim().min(1).max(TITLE_MAXIMUM) }),
    rateLimit: { scope: "pages.rename", limit: 120, windowSeconds: 60 * 60 },
  },
  async ({ body, params, userId }) => {
    // The slug is deliberately not recomputed: a published page's URL is a link
    // somebody may have shared, and renaming is not moving.
    const page = await renamePage({ userId }, pageOf(params), body.title)

    if (page === null) throw Errors.resource.notFound("Page")

    return { page }
  },
)

/** Soft delete. The row stays, and the page is recoverable. */
export const DELETE = route(
  {
    authenticate,
    rateLimit: { scope: "pages.delete", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const deleted = await deletePage({ userId }, pageOf(params))

    if (!deleted) throw Errors.resource.notFound("Page")

    return { deleted: true }
  },
)
