import "server-only"

import { prisma } from "../client"
import type { TenantContext } from "../tenant"

/**
 * Projects.
 *
 * Every query filters on the tenant's userId. A project belonging to another
 * user is not "forbidden" — it is invisible, which is what prevents an
 * endpoint from revealing that it exists.
 */

export interface CreateProjectInput {
  name: string
  slug: string
  description?: string
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  logoUrl?: string
  faviconUrl?: string
}

export const projectRepository = {
  async list(tenant: TenantContext) {
    return prisma.project.findMany({
      where: { userId: tenant.userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    })
  },

  async findById(tenant: TenantContext, id: string) {
    return prisma.project.findFirst({
      where: { id, userId: tenant.userId, deletedAt: null },
    })
  },

  async findBySlug(tenant: TenantContext, slug: string) {
    return prisma.project.findFirst({
      where: { slug, userId: tenant.userId, deletedAt: null },
    })
  },

  async create(tenant: TenantContext, input: CreateProjectInput) {
    return prisma.project.create({
      data: { ...input, userId: tenant.userId },
    })
  },

  async update(tenant: TenantContext, id: string, input: UpdateProjectInput) {
    // updateMany, not update: it applies the tenant filter. `update` takes a
    // unique selector only, which would ignore ownership.
    const result = await prisma.project.updateMany({
      where: { id, userId: tenant.userId, deletedAt: null },
      data: input,
    })

    return result.count === 1 ? this.findById(tenant, id) : null
  },

  /** Soft delete. Projects are recoverable for 30 days, per docs/history-versioning.md. */
  async softDelete(tenant: TenantContext, id: string) {
    const result = await prisma.project.updateMany({
      where: { id, userId: tenant.userId, deletedAt: null },
      data: { deletedAt: new Date() },
    })

    return result.count === 1
  },

  async restore(tenant: TenantContext, id: string) {
    const result = await prisma.project.updateMany({
      where: { id, userId: tenant.userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    })

    return result.count === 1
  },

  async countActive(tenant: TenantContext) {
    return prisma.project.count({
      where: { userId: tenant.userId, deletedAt: null },
    })
  },
}
