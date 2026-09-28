import { assertCan, authenticate, route } from "@checkout-studio/api"
import { projectRepository } from "@checkout-studio/database"
import { uniqueSlug } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * Projects.
 *
 * The list is everything the person owns that has not been deleted; the
 * repository filters on the tenant, so a project belonging to someone else is
 * not forbidden — it is invisible.
 */

export const NAME_MAXIMUM = 80

export const GET = route({ authenticate }, async ({ userId }) => {
  const projects = await projectRepository.list({ userId })

  return {
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
  }
})

export const POST = route(
  {
    authenticate,
    body: z.object({
      name: z.string().trim().min(1).max(NAME_MAXIMUM),
      description: z.string().trim().max(500).optional(),
    }),
    rateLimit: { scope: "projects.create", limit: 30, windowSeconds: 60 * 60 },
  },
  async ({ body, userId }) => {
    const tenant = { userId }
    const existing = await projectRepository.list(tenant)

    // The plan's project limit, checked before anything is written. The count
    // comes from the list that is needed anyway, rather than a second query.
    await assertCan(userId, "createProject", { current: existing.length })

    // The slug is derived once and then left alone: renaming a project must not
    // move a URL somebody shared.
    const slug = uniqueSlug(
      body.name,
      existing.map((project) => project.slug),
    )

    const project = await projectRepository.create(tenant, {
      name: body.name,
      slug,
      ...(body.description === undefined ? {} : { description: body.description }),
    })

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    }
  },
)
