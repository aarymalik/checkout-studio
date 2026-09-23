import "server-only"

import { type Prisma, prisma } from "../client"
import { requireProject, type TenantContext } from "../tenant"

/**
 * Pages and their drafts.
 *
 * The draft is the mutable working copy; revisions are immutable snapshots.
 * Autosave writes the draft and creates no revision, per docs/database.md.
 */

export interface CreatePageInput {
  title: string
  slug: string
  draftSchema: Prisma.InputJsonValue
  schemaVersion?: string
}

export class DraftConflictError extends Error {
  override readonly name = "DraftConflictError"

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Draft was modified by another session: expected version ${expectedVersion}, found ${actualVersion}`,
    )
  }
}

/** A page is reachable only through a project the tenant owns. */
const ownedBy = (tenant: TenantContext) => ({
  project: { userId: tenant.userId, deletedAt: null },
  deletedAt: null,
})

export const pageRepository = {
  async list(tenant: TenantContext) {
    const projectId = requireProject(tenant, "Page")

    return prisma.page.findMany({
      where: { projectId, ...ownedBy(tenant) },
      orderBy: { updatedAt: "desc" },
    })
  },

  async findById(tenant: TenantContext, id: string) {
    return prisma.page.findFirst({ where: { id, ...ownedBy(tenant) } })
  },

  async create(tenant: TenantContext, input: CreatePageInput) {
    const projectId = requireProject(tenant, "Page")

    return prisma.page.create({
      data: {
        projectId,
        title: input.title,
        slug: input.slug,
        draftSchema: input.draftSchema,
        ...(input.schemaVersion ? { schemaVersion: input.schemaVersion } : {}),
      },
    })
  },

  /**
   * Writes the draft, but only if the caller started from the current version.
   *
   * The check and the increment happen in one statement, so two sessions
   * racing cannot both succeed. There is no unconditional write path.
   */
  async saveDraft(
    tenant: TenantContext,
    id: string,
    baseVersion: number,
    draftSchema: Prisma.InputJsonValue,
  ) {
    const result = await prisma.page.updateMany({
      where: { id, draftVersion: baseVersion, ...ownedBy(tenant) },
      data: { draftSchema, draftVersion: { increment: 1 } },
    })

    if (result.count === 1) {
      return prisma.page.findFirstOrThrow({
        where: { id },
        select: { id: true, draftVersion: true, updatedAt: true },
      })
    }

    const current = await this.findById(tenant, id)
    if (!current) return null

    throw new DraftConflictError(baseVersion, current.draftVersion)
  },

  async softDelete(tenant: TenantContext, id: string) {
    const result = await prisma.page.updateMany({
      where: { id, ...ownedBy(tenant) },
      data: { deletedAt: new Date() },
    })

    return result.count === 1
  },

  async countPublished(tenant: TenantContext) {
    return prisma.page.count({
      where: {
        project: { userId: tenant.userId, deletedAt: null },
        deletedAt: null,
        publishedRevisionId: { not: null },
      },
    })
  },
}
