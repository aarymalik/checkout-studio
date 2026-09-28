import { authenticate, route } from "@checkout-studio/api"
import { projectRepository } from "@checkout-studio/database"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

import { NAME_MAXIMUM } from "../route"

/**
 * One project.
 *
 * A project that belongs to somebody else answers the same way as one that
 * never existed, because telling the two apart tells the caller something.
 */

function idOf(params: Record<string, string>): string {
  const id = params["projectId"]

  if (id === undefined || id === "") throw Errors.resource.notFound("Project")

  return id
}

export const PATCH = route(
  {
    authenticate,
    body: z.object({
      name: z.string().trim().min(1).max(NAME_MAXIMUM).optional(),
      description: z.string().trim().max(500).optional(),
    }),
    rateLimit: { scope: "projects.update", limit: 120, windowSeconds: 60 * 60 },
  },
  async ({ body, params, userId }) => {
    // The slug is deliberately not recomputed from a new name: a link somebody
    // shared should keep working after a rename.
    //
    // Fields are spread conditionally rather than passed through: an explicit
    // `undefined` would be a write, and clearing a description is not the same
    // request as leaving it alone.
    const project = await projectRepository.update({ userId }, idOf(params), {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.description === undefined ? {} : { description: body.description }),
    })

    if (project === null) throw Errors.resource.notFound("Project")

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

/**
 * Soft delete.
 *
 * The row stays, marked, and is recoverable for thirty days per
 * docs/history-versioning.md. Nothing a person spent an afternoon on is removed
 * by one click and a confirmation dialog.
 */
export const DELETE = route(
  {
    authenticate,
    rateLimit: { scope: "projects.delete", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const deleted = await projectRepository.softDelete({ userId }, idOf(params))

    if (!deleted) throw Errors.resource.notFound("Project")

    return { deleted: true }
  },
)

/** Undo a delete, while the project is still recoverable. */
export const POST = route(
  {
    authenticate,
    rateLimit: { scope: "projects.restore", limit: 60, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const restored = await projectRepository.restore({ userId }, idOf(params))

    if (!restored) throw Errors.resource.notFound("Project")

    return { restored: true }
  },
)
