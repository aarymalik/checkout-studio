import { authenticate, route, saveTheme } from "@checkout-studio/api"
import { checkoutTheme } from "@checkout-studio/schema"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * A project's theme.
 *
 * One row per project, and the whole of it on every write. A theme is a single
 * record with no field-level merge behind it, so a patch would mean two people
 * with the panel open taking turns overwriting each other — `updatedAt` is
 * what makes the second one find out.
 *
 * Write only. The studio resolves its theme server-side when it renders a
 * project, and a save answers with what it wrote, so nothing needs to ask for
 * one over HTTP.
 *
 * A `GET` was written here first and taken out again. `resolveTheme` takes a
 * project id and no tenant — which is safe where it is called, after the
 * project has already been authorised, and is not safe behind a URL that
 * carries the project id as a parameter. Rather than wrap it in an ownership
 * check nothing had asked for, the route went.
 */

function projectOf(params: Record<string, string>): string {
  const projectId = params["projectId"]

  if (projectId === undefined || projectId === "") throw Errors.resource.notFound("Project")

  return projectId
}

export const PUT = route(
  {
    authenticate,
    body: z.object({
      theme: checkoutTheme,
      /**
       * What the caller believes it is editing, so a save made against a
       * stale copy is refused rather than applied.
       */
      updatedAt: z.iso.datetime().optional(),
    }),
    rateLimit: { scope: "theme.save", limit: 240, windowSeconds: 60 * 60 },
  },
  async ({ body, params, userId }) => {
    const tenant = { userId, projectId: projectOf(params) }

    return {
      theme: await saveTheme(
        tenant,
        body.theme,
        body.updatedAt === undefined ? undefined : { updatedAt: new Date(body.updatedAt) },
      ),
    }
  },
)
