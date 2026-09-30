import { assertCan, authenticate, createPage, listPages, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * The pages of a project.
 *
 * Every query carries the project, because a page is reachable only through one
 * the tenant owns — a page id alone would let somebody address another
 * project's page.
 */

export const TITLE_MAXIMUM = 120

function projectOf(params: Record<string, string>): string {
  const projectId = params["projectId"]

  if (projectId === undefined || projectId === "") throw Errors.resource.notFound("Project")

  return projectId
}

export const GET = route({ authenticate }, async ({ params, userId }) => ({
  pages: await listPages({ userId, projectId: projectOf(params) }),
}))

export const POST = route(
  {
    authenticate,
    body: z.object({
      title: z.string().trim().min(1).max(TITLE_MAXIMUM),
      themeId: z.string().min(1).max(64).optional(),
    }),
    rateLimit: { scope: "pages.create", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ body, params, userId }) => {
    const tenant = { userId, projectId: projectOf(params) }

    // The plan's published-page limit is checked at publish, not here: an
    // unpublished draft costs nothing and refusing one would stop somebody
    // planning work they intend to pay for.
    await assertCan(userId, "createTemplate", { current: 0 })

    return {
      page: await createPage(tenant, {
        title: body.title,
        ...(body.themeId === undefined ? {} : { themeId: body.themeId }),
      }),
    }
  },
)
