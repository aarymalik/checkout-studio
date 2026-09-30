import "server-only"

import { prisma } from "../client"

/**
 * Published pages, as a visitor reaches them.
 *
 * The one repository here that is **not** tenant-scoped, and deliberately so: a
 * customer arriving at a checkout has no account, and every other query in this
 * package starts from a user id that does not exist on this path. What stands in
 * for ownership is the hostname — a domain belongs to exactly one project, and a
 * slug to exactly one page within it.
 *
 * Drafts are unreachable from here. A published page serves its published
 * revision and nothing else, which is what makes a live checkout immune to
 * whatever somebody is editing.
 */

export interface PublishedPage {
  pageId: string
  projectId: string
  title: string
  /** The revision's snapshot of the document. */
  schema: unknown
  /** The revision's snapshot of the theme, immune to later theme edits. */
  theme: unknown
  schemaVersion: string
  revisionId: string
  revisionNumber: number
  publishedAt: Date
}

export const publishedRepository = {
  /**
   * The published revision serving `hostname/slug`, or null.
   *
   * Null covers every way this can come to nothing — no such domain, an
   * unverified one, no such page, a page that was unpublished — because the
   * answer to a visitor is the same in all of them, and distinguishing them
   * here would only tell an unauthenticated caller which hostnames exist.
   */
  async findByHostAndSlug(hostname: string, slug: string): Promise<PublishedPage | null> {
    const domain = await prisma.domain.findFirst({
      where: { hostname: hostname.toLowerCase(), verified: true },
      select: { projectId: true },
    })

    if (domain === null) return null

    const page = await prisma.page.findFirst({
      where: {
        projectId: domain.projectId,
        slug,
        status: "published",
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        publishedRevision: {
          select: {
            id: true,
            number: true,
            schema: true,
            theme: true,
            schemaVersion: true,
            createdAt: true,
          },
        },
      },
    })

    if (page?.publishedRevision === null || page?.publishedRevision === undefined) return null

    return {
      pageId: page.id,
      projectId: page.projectId,
      title: page.title,
      schema: page.publishedRevision.schema,
      theme: page.publishedRevision.theme,
      schemaVersion: page.publishedRevision.schemaVersion,
      revisionId: page.publishedRevision.id,
      revisionNumber: page.publishedRevision.number,
      publishedAt: page.publishedRevision.createdAt,
    }
  },

  /**
   * The newest revision of a page that is not the one currently published.
   *
   * The second link in the renderer's fallback chain: when a published
   * revision will not render, the page falls back to the last one that did
   * rather than showing a customer an error. See docs/error-handling.md
   * § Renderer Error Handling.
   */
  async previousRevision(pageId: string, notRevisionId: string): Promise<PublishedPage | null> {
    const page = await prisma.page.findFirst({
      where: { id: pageId, deletedAt: null },
      select: { id: true, projectId: true, title: true },
    })

    if (page === null) return null

    const revision = await prisma.revision.findFirst({
      where: { pageId, kind: "publish", id: { not: notRevisionId } },
      orderBy: { number: "desc" },
      select: {
        id: true,
        number: true,
        schema: true,
        theme: true,
        schemaVersion: true,
        createdAt: true,
      },
    })

    if (revision === null) return null

    return {
      pageId: page.id,
      projectId: page.projectId,
      title: page.title,
      schema: revision.schema,
      theme: revision.theme,
      schemaVersion: revision.schemaVersion,
      revisionId: revision.id,
      revisionNumber: revision.number,
      publishedAt: revision.createdAt,
    }
  },
}
