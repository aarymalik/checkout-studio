import { authenticate, deleteAsset, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"

/** One asset: take it out of the library. */

function idsOf(params: Record<string, string>): { projectId: string; assetId: string } {
  const projectId = params["projectId"]
  const assetId = params["assetId"]

  if (projectId === undefined || projectId === "") throw Errors.resource.notFound("Project")
  if (assetId === undefined || assetId === "") throw Errors.resource.notFound("Asset")

  return { projectId, assetId }
}

/**
 * Soft delete, refused while a page still points at it.
 *
 * The decision is `deleteAsset`'s, which can be tested without a request.
 * What is here is the two things that are only true over HTTP: turning a
 * refusal into a status and a sentence, and the rate limit.
 */
export const DELETE = route(
  {
    authenticate,
    rateLimit: { scope: "assets.delete", limit: 120, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const { projectId, assetId } = idsOf(params)
    const result = await deleteAsset({ userId, projectId }, assetId)

    if (result.ok) return { deleted: true }

    if (result.reason === "not-found") throw Errors.resource.notFound("Asset", assetId)

    throw Errors.resource.inUse("Asset", result.places)
  },
)
