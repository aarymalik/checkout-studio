import { authenticate, duplicatePage, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"

/**
 * Copy a page, its document and all.
 *
 * A draft that cannot be read is refused rather than copied as an empty page:
 * that would look like success and lose everything the original held.
 */
export const POST = route(
  {
    authenticate,
    rateLimit: { scope: "pages.duplicate", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const pageId = params["pageId"]

    if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

    const result = await duplicatePage({ userId }, pageId)

    if (result.ok) return { page: result.page }

    if (result.reason === "not-found") throw Errors.resource.notFound("Page")

    throw Errors.validation.invalidInput([
      {
        path: "pageId",
        code: "unreadable",
        message: "This page's content cannot be read, so it cannot be copied.",
      },
    ])
  },
)
