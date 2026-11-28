import { authenticate, publishPage, route, unpublishPage } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"

import { ENGINE_VERSION, registry } from "@/studio/registry"

/**
 * Whether a page is live.
 *
 * `POST` puts it there, `DELETE` takes it down — one resource, which is
 * what being published is. Deliberately thin: everything that decides
 * anything is in `packages/api/src/services/publishing` and tested against
 * a real database there.
 *
 * ## The rules come from this installation's registry
 *
 * Publishing runs the document validators the plugins registered, and
 * which plugins are installed is the application's business rather than
 * the service's. So the registry is read here and handed over — the same
 * registry the canvas renders through, so what the editor warns about and
 * what publishing refuses cannot disagree.
 */

function pageOf(params: Record<string, string>): string {
  const pageId = params["pageId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

  return pageId
}

export const POST = route(
  {
    authenticate,
    /*
     * A publish is a page going in front of customers, so this is held to
     * roughly what a person does rather than to what a script could.
     */
    rateLimit: { scope: "pages.publish", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const result = await publishPage(
      { userId },
      {
        pageId: pageOf(params),
        validators: registry.documentValidators(),
        rendererVersion: ENGINE_VERSION,
      },
    )

    if (result.ok) {
      return {
        revision: { id: result.revisionId, number: result.revisionNumber },
        /** False when this published exactly what was already live. */
        created: result.created,
        warnings: result.warnings,
      }
    }

    if (result.reason === "not-found") throw Errors.resource.notFound("Page")

    /*
     * The issues go out as they are. Unlike a template's schema problems,
     * these are about this merchant's own page and are written for them —
     * "this draws an image the project no longer has" is the whole point
     * of having validated.
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

export const DELETE = route(
  {
    authenticate,
    rateLimit: { scope: "pages.unpublish", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const result = await unpublishPage({ userId }, pageOf(params))

    if (!result.ok) throw Errors.resource.notFound("Page")

    // False when it was already down, which is not a failure: taking down
    // something already down is what the caller asked for.
    return { changed: result.changed }
  },
)
