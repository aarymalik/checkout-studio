import { authenticate, listTemplates, route, templateQuery } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"

/**
 * A project's template library: its own, and the public ones.
 *
 * Deliberately thin. What is only true over HTTP is reading the filters off
 * a query string, and even that is `templateQuery`'s job so it can be tested
 * without a request — what is left here is the project and the rate limit.
 */

function projectOf(params: Record<string, string>): string {
  const projectId = params["projectId"]

  if (projectId === undefined || projectId === "") throw Errors.resource.notFound("Project")

  return projectId
}

export const GET = route(
  {
    authenticate,
    /*
     * Generous but present. A search box asks on every keystroke, so the
     * limit is for a crawler walking the catalogue rather than for anybody
     * using the panel.
     */
    rateLimit: { scope: "templates.list", limit: 600, windowSeconds: 60 * 60 },
  },
  async ({ params, request, userId }) =>
    listTemplates(
      { userId, projectId: projectOf(params) },
      templateQuery(new URL(request.url).searchParams),
    ),
)
