import { authenticate, installTemplate, route } from "@checkout-studio/api"
import { logger } from "@checkout-studio/observability"
import { Errors } from "@checkout-studio/utils"

/**
 * Installing a template as a new page in this project.
 *
 * A POST, because it creates a page. The template is unchanged by it, so
 * this is not an edit of the thing the URL names — it is a new page made
 * from it, and what comes back is where to go.
 *
 * A template that is not visible answers as one that never existed, the way
 * every other scoped read here does: telling the two apart tells the caller
 * that a template with that id exists somewhere.
 */

function identifier(params: Record<string, string>, key: string, resource: string): string {
  const value = params[key]

  if (value === undefined || value === "") throw Errors.resource.notFound(resource)

  return value
}

export const POST = route(
  {
    authenticate,
    /*
     * A page per install, so this is held to roughly what a person does
     * rather than to what a search box does. The listing beside it allows
     * ten times as many, and that asymmetry is the point: reading the
     * catalogue is cheap and filling a project with pages is not.
     */
    rateLimit: { scope: "templates.install", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const projectId = identifier(params, "projectId", "Project")
    const templateId = identifier(params, "templateId", "Template")
    const result = await installTemplate({ userId, projectId }, templateId)

    if (result.ok) {
      return { page: { id: result.pageId, title: result.title, slug: result.slug } }
    }

    if (result.reason === "not-found") throw Errors.resource.notFound("Template")

    /*
     * Logged here and not sent on. The problems name schema paths inside
     * somebody else's template, which is nothing the person installing it
     * can act on and more than they should be told about a public row — but
     * a template nobody can install is a row that needs fixing, and this is
     * the only place that knows which one it is and why.
     */
    logger.error("templates.install_unreadable", { templateId, problems: result.problems })

    throw Errors.validation.invalidInput([
      {
        path: "templateId",
        code: "unreadable",
        message: "This template's content cannot be read, so it cannot be installed.",
      },
    ])
  },
)
