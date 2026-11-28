import "server-only"

import { prisma } from "../client"
import type { TenantContext } from "../tenant"

/**
 * Links that show a draft to somebody who cannot sign in.
 *
 * Two halves with different rules, which is why they are in one file: a
 * merchant creates and revokes them and must own the page, and a visitor
 * redeems one holding nothing but the secret.
 *
 * The redemption is therefore not tenant-scoped — there is no account on
 * that path, exactly as `publishedRepository` has none. What stands in for
 * ownership is the secret itself: thirty-two random bytes, hashed here, so
 * knowing the hash is not knowing the link.
 */

export interface StoredPreviewToken {
  id: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}

/** Reachable only through a page in a project the tenant owns. */
const ownedBy = (tenant: TenantContext) => ({
  page: { deletedAt: null, project: { userId: tenant.userId, deletedAt: null } },
})

const COLUMNS = { id: true, expiresAt: true, revokedAt: true, createdAt: true } as const

export const previewRepository = {
  async issue(
    tenant: TenantContext,
    input: { pageId: string; tokenHash: string; expiresAt: Date },
  ): Promise<StoredPreviewToken | null> {
    const page = await prisma.page.findFirst({
      where: {
        id: input.pageId,
        deletedAt: null,
        project: { userId: tenant.userId, deletedAt: null },
      },
      select: { id: true },
    })

    if (page === null) return null

    return prisma.previewToken.create({
      data: {
        pageId: input.pageId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdBy: tenant.userId,
      },
      select: COLUMNS,
    })
  },

  /** Every link made for a page, newest first, including dead ones. */
  async list(tenant: TenantContext, pageId: string): Promise<readonly StoredPreviewToken[]> {
    return prisma.previewToken.findMany({
      where: { pageId, ...ownedBy(tenant) },
      orderBy: { createdAt: "desc" },
      select: COLUMNS,
    })
  },

  /**
   * Stops a link that is already out in the world. False when there was
   * nothing to stop.
   *
   * Revoking twice is not a failure, so this answers on whether a live one
   * moved rather than on whether a row exists.
   */
  async revoke(tenant: TenantContext, id: string): Promise<boolean> {
    const { count } = await prisma.previewToken.updateMany({
      where: { id, revokedAt: null, ...ownedBy(tenant) },
      data: { revokedAt: new Date() },
    })

    return count === 1
  },

  /** Whether this caller has a link by that id at all, revoked or not. */
  async exists(tenant: TenantContext, id: string): Promise<boolean> {
    return (
      (await prisma.previewToken.findFirst({
        where: { id, ...ownedBy(tenant) },
        select: { id: true },
      })) !== null
    )
  },

  /**
   * The draft a redeemed link shows, by the page it named.
   *
   * Unauthenticated, like `redeem` above and for the same reason: the
   * token was the authorisation, and there is no account on this path to
   * check anything against. Separate from `redeem` so that the thing
   * which decides whether a link works stays a question about the link,
   * and reading a page stays a question about a page.
   *
   * Null for a page that went away between the two, which is a tab left
   * open while somebody deleted it.
   */
  async draftFor(
    pageId: string,
  ): Promise<{ title: string; projectId: string; draftSchema: unknown } | null> {
    return prisma.page.findFirst({
      where: { id: pageId, deletedAt: null, project: { deletedAt: null } },
      select: { title: true, projectId: true, draftSchema: true },
    })
  },

  /**
   * The page a secret opens, or null.
   *
   * Unauthenticated: whoever holds the link is who this is for. Null covers
   * a hash nobody issued, a link that was revoked and one that has expired,
   * because the answer to somebody holding a dead link is the same in all
   * three — and distinguishing them would tell a guesser which guesses were
   * closer.
   */
  async redeem(tokenHash: string, now: Date): Promise<{ pageId: string } | null> {
    return prisma.previewToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
        page: { deletedAt: null, project: { deletedAt: null } },
      },
      select: { pageId: true },
    })
  },
}
