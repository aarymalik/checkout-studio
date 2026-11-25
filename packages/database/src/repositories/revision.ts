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
  /** See the column. Taken by the caller, because the row cannot give it back. */
  contentHash?: string
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
   * The revision a page is currently serving, if any.
   *
   * Enough of it to decide whether publishing again would change anything,
   * and no more: the schema column is the largest in the table and a
   * question about sameness does not need to read it.
   */
  async published(tenant: TenantContext, pageId: string) {
    return prisma.revision.findFirst({
      where: { publishedFor: { id: pageId }, ...ownedBy(tenant) },
      select: { id: true, number: true, contentHash: true },
    })
  },

  /**
   * Creates the next revision for a page.
   *
   * The number is allocated inside the transaction that inserts the row, so
   * two concurrent saves cannot produce the same number — the unique
   * constraint on (pageId, number) is the backstop if they try.
   */
  async create(tenant: TenantContext, input: CreateRevisionInput) {
    return write(tenant, input, () => ({}))
  },

  /**
   * Creates a revision and makes it the one the world sees.
   *
   * One transaction, because the two halves are not separately meaningful:
   * a revision nothing points at is history, and a page pointing at a
   * revision that was never written is a checkout that serves nothing. The
   * second is the one worth a transaction.
   *
   * The page becomes `published` here and not before. Status is derived
   * from having a published revision rather than set alongside it, which is
   * what keeps "published" from being a label a page can wear while serving
   * nothing.
   */
  async publish(tenant: TenantContext, input: CreateRevisionInput) {
    return write(tenant, input, (revisionId) => ({
      publishedRevisionId: revisionId,
      status: "published" as const,
    }))
  },
}

/**
 * The shared half: allocate the number, insert, then point the page.
 *
 * `create` and `publish` differ only in which columns on the page move, so
 * the numbering lives here once. Two copies of it would be two chances to
 * allocate the same number, and the unique constraint would then be the
 * only thing standing between a merchant and a lost save.
 */
async function write(
  tenant: TenantContext,
  input: CreateRevisionInput,
  pointers: (revisionId: string) => Prisma.PageUpdateInput,
) {
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
        ...(input.contentHash === undefined ? {} : { contentHash: input.contentHash }),
        createdBy: input.createdBy,
      },
    })

    await tx.page.update({
      where: { id: input.pageId },
      data: { currentRevisionId: revision.id, ...pointers(revision.id) },
    })

    return revision
  })
}
