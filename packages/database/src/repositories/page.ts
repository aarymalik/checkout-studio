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

/**
 * One stored document, and which page it belongs to.
 *
 * The title travels with it because the only caller is a refusal that has to
 * name the page — "still used on Checkout" is an answer somebody can act on
 * and "still in use" is not.
 */
export interface StoredDocument {
  pageId: string
  pageTitle: string
  /** The working copy, or the revision the page is serving. */
  source: "draft" | "published"
  schema: Prisma.JsonValue
}

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

  /**
   * The slugs a new page must avoid: the live ones.
   *
   * Deleting a page frees its URL. The unique index is partial — live pages
   * only, see the 20261002180000_live_slug_uniqueness migration — so a deleted
   * page's slug is available again, which is what somebody who deleted a page
   * and named the next one the same thing expects.
   *
   * Its own query rather than `list`, which returns whole rows: this needs one
   * column, and saying so keeps a page listing from quietly becoming the thing
   * slug allocation depends on.
   */
  async slugsInUse(tenant: TenantContext): Promise<readonly string[]> {
    const projectId = requireProject(tenant, "Page")

    const rows = await prisma.page.findMany({
      where: { projectId, ...ownedBy(tenant) },
      select: { slug: true },
    })

    return rows.map((row) => row.slug)
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

  /**
   * Rename a page.
   *
   * The slug is deliberately not recomputed: a published page's URL is a link
   * somebody may have shared, and renaming is not moving.
   *
   * Not a draft write, so it does not touch `draftVersion` — a rename during
   * somebody else's editing session must not invalidate their next save.
   */
  async rename(tenant: TenantContext, id: string, title: string) {
    const result = await prisma.page.updateMany({
      where: { id, ...ownedBy(tenant) },
      data: { title },
    })

    return result.count === 1 ? this.findById(tenant, id) : null
  },

  /**
   * Move a page to a different address.
   *
   * Separate from `rename` because it is a different act with different
   * consequences: a title is a label, and a slug is where a published page
   * lives. Changing one breaks nothing and changing the other breaks every link
   * anybody holds.
   *
   * The partial unique index is the backstop. The service checks first so it
   * can say something useful, but two sessions racing would both pass that
   * check and only one can win here.
   */
  async setSlug(tenant: TenantContext, id: string, slug: string) {
    const result = await prisma.page.updateMany({
      where: { id, ...ownedBy(tenant) },
      data: { slug },
    })

    return result.count === 1 ? this.findById(tenant, id) : null
  },

  /**
   * Whether another live page in the project already answers to this address.
   *
   * The project is a parameter rather than taken from the tenant: a caller
   * holding a page id does not necessarily know which project it is in, and
   * whoever asks this has just loaded the page and does.
   */
  async slugTaken(
    tenant: TenantContext,
    projectId: string,
    slug: string,
    exceptPageId: string,
  ): Promise<boolean> {
    const clash = await prisma.page.findFirst({
      where: { projectId, slug, id: { not: exceptPageId }, ...ownedBy(tenant) },
      select: { id: true },
    })

    return clash !== null
  },

  async softDelete(tenant: TenantContext, id: string) {
    const result = await prisma.page.updateMany({
      where: { id, ...ownedBy(tenant) },
      data: { deletedAt: new Date() },
    })

    return result.count === 1
  },

  /**
   * Every document this project holds: each live page's draft, and the
   * revision each has published.
   *
   * Both, because they are different pages in the only sense that matters
   * here. An asset taken out of a draft is still on the page a customer is
   * looking at until that draft is published, and deleting its file then
   * would put a hole in a live checkout.
   *
   * Deleted pages are left out, as every page query here leaves them out.
   * Nothing restores one, so a reference held only by a deleted page is a
   * reference nothing can ever render — and counting it would make an asset
   * undeletable for a reason the merchant cannot see or undo.
   *
   * Older revisions are left out too, which is the one deliberate hole: an
   * asset deleted today is missing from a revision restored tomorrow. The
   * renderer reports that as `asset-missing` and draws the rest, and the
   * alternative — every asset ever used is in use for ever — is a library
   * nobody can tidy.
   */
  async storedDocuments(tenant: TenantContext): Promise<readonly StoredDocument[]> {
    const projectId = requireProject(tenant, "Page")

    const rows = await prisma.page.findMany({
      where: { projectId, ...ownedBy(tenant) },
      select: {
        id: true,
        title: true,
        draftSchema: true,
        publishedRevision: { select: { schema: true } },
      },
    })

    return rows.flatMap((row) => {
      const draft: StoredDocument = {
        pageId: row.id,
        pageTitle: row.title,
        source: "draft",
        schema: row.draftSchema,
      }

      if (row.publishedRevision === null) return [draft]

      return [
        draft,
        {
          pageId: row.id,
          pageTitle: row.title,
          source: "published" as const,
          schema: row.publishedRevision.schema,
        },
      ]
    })
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
