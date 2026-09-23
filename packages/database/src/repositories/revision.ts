import "server-only"

import { type Prisma, prisma } from "../client"
import type { TenantContext } from "../tenant"

/**
 * Revisions.
 *
 * Immutable: there is no update method, and the database refuses one anyway.
 * Publishing points a page at a revision; it never edits one.
 */

export type RevisionKind = "manual" | "publish" | "import" | "recovery"

export interface CreateRevisionInput {
  pageId: string
  kind: RevisionKind
  name?: string
  schema: Prisma.InputJsonValue
  theme: Prisma.InputJsonValue
  symbols?: Prisma.InputJsonValue
  schemaVersion: string
  rendererVersion: string
  createdBy: string
}

const ownedBy = (tenant: TenantContext) => ({
  page: { project: { userId: tenant.userId, deletedAt: null } },
})

export const revisionRepository = {
  async list(tenant: TenantContext, pageId: string) {
    return prisma.revision.findMany({
      where: { pageId, ...ownedBy(tenant) },
      orderBy: { number: "desc" },
      select: {
        id: true,
        number: true,
        kind: true,
        name: true,
        createdBy: true,
        createdAt: true,
        schemaVersion: true,
      },
    })
  },

  async findById(tenant: TenantContext, id: string) {
    return prisma.revision.findFirst({ where: { id, ...ownedBy(tenant) } })
  },

  /**
   * Creates the next revision for a page.
   *
   * The number is allocated inside the transaction that inserts the row, so
   * two concurrent saves cannot produce the same number — the unique
   * constraint on (pageId, number) is the backstop if they try.
   */
  async create(tenant: TenantContext, input: CreateRevisionInput) {
    const page = await prisma.page.findFirst({
      where: { id: input.pageId, project: { userId: tenant.userId, deletedAt: null } },
      select: { id: true },
    })

    if (!page) return null

    return prisma.$transaction(async (tx) => {
      const latest = await tx.revision.findFirst({
        where: { pageId: input.pageId },
        orderBy: { number: "desc" },
        select: { number: true },
      })

      const revision = await tx.revision.create({
        data: {
          pageId: input.pageId,
          number: (latest?.number ?? 0) + 1,
          kind: input.kind,
          ...(input.name ? { name: input.name } : {}),
          schema: input.schema,
          theme: input.theme,
          ...(input.symbols ? { symbols: input.symbols } : {}),
          schemaVersion: input.schemaVersion,
          rendererVersion: input.rendererVersion,
          createdBy: input.createdBy,
        },
      })

      await tx.page.update({
        where: { id: input.pageId },
        data: { currentRevisionId: revision.id },
      })

      return revision
    })
  },
}
