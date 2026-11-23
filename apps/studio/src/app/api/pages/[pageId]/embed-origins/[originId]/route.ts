import { authenticate, removeOrigin, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"

/**
 * Taking one domain off a page's allowlist.
 *
 * Removing the last one is allowed and is not an accident to guard
 * against: an embed with no origins is `frame-ancestors 'none'`, which is
 * how a merchant switches an embed off without unpublishing the page.
 */
export const DELETE = route(
  {
    authenticate,
    rateLimit: { scope: "embed.origins.remove", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const pageId = params["pageId"]
    const originId = params["originId"]

    if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")
    if (originId === undefined || originId === "") throw Errors.resource.notFound("Domain")

    // False covers a row that is not there and one that is somebody else's,
    // because the answer to this caller is the same either way.
    if (!(await removeOrigin({ userId }, pageId, originId))) {
      throw Errors.resource.notFound("Domain")
    }

    return { removed: true }
  },
)
