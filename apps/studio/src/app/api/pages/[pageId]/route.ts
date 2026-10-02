import { authenticate, deletePage, renamePage, route, setPageSlug } from "@checkout-studio/api"
import type { SlugOutcome } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

import { TITLE_MAXIMUM } from "../../projects/[projectId]/pages/route"

/** One page: rename it, move it, or delete it. */

/** The slug column's own limit, in docs/database.md. */
const SLUG_MAXIMUM = 60

function pageOf(params: Record<string, string>): string {
  const pageId = params["pageId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

  return pageId
}

/**
 * Rename a page, move it, or both.
 *
 * Renaming never changes the address. A title is a label; a slug is where a
 * published page lives, and recomputing one from the other would move a page
 * somebody has linked to because they fixed a typo in its name.
 *
 * Moving it is a separate field, sent only when the user asked for it. The move
 * goes first: if the address is taken, nothing has changed, and the user is not
 * left looking at a page that is half-edited.
 */
export const PATCH = route(
  {
    authenticate,
    body: z
      .object({
        title: z.string().trim().min(1).max(TITLE_MAXIMUM).optional(),
        slug: z.string().trim().min(1).max(SLUG_MAXIMUM).optional(),
      })
      .refine((value) => value.title !== undefined || value.slug !== undefined, {
        message: "Nothing to change.",
      }),
    rateLimit: { scope: "pages.rename", limit: 120, windowSeconds: 60 * 60 },
  },
  async ({ body, params, userId }) => {
    const pageId = pageOf(params)
    const tenant = { userId }
    let page = null

    if (body.slug !== undefined) {
      const moved = await setPageSlug(tenant, pageId, body.slug)

      if (!moved.ok) throw slugProblem(moved.reason)

      page = moved.page
    }

    if (body.title !== undefined) {
      page = await renamePage(tenant, pageId, body.title)
    }

    if (page === null) throw Errors.resource.notFound("Page")

    return { page }
  },
)

function slugProblem(reason: Exclude<SlugOutcome, { ok: true }>["reason"]): Error {
  if (reason === "not-found") return Errors.resource.notFound("Page")
  if (reason === "taken") return Errors.resource.alreadyExists("Page", "address")

  return Errors.validation.invalidInput([
    {
      path: "slug",
      code: "invalid",
      message: "An address needs at least one letter or number.",
    },
  ])
}

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
