import { authenticate, revokePreview, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"

/**
 * Stopping a link that is already out in the world.
 *
 * docs/api-spec.md § Revoke Preview Link, and the reason preview tokens
 * are rows rather than signed blobs: a link somebody has already sent has
 * to be stoppable before it expires.
 *
 * Addressed by the token's own id rather than under its page, as the spec
 * has it. A merchant revoking a link is acting on the link; which page it
 * belongs to is something the link knows and they may not.
 */
export const DELETE = route(
  {
    authenticate,
    rateLimit: { scope: "previews.revoke", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const tokenId = params["tokenId"]

    if (tokenId === undefined || tokenId === "") throw Errors.resource.notFound("Preview link")

    const result = await revokePreview({ userId }, tokenId)

    if (!result.ok) throw Errors.resource.notFound("Preview link")

    /*
     * False when it was already revoked, which is not a failure: a panel
     * showing a list somebody has had open for a minute should not
     * report an error for getting exactly what it asked for.
     */
    return { changed: result.changed }
  },
)
