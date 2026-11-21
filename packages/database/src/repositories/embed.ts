import { prisma } from "../client"
import { requireProject, type TenantContext } from "../tenant"

/**
 * What may frame one page's embedded checkout.
 *
 * docs/rfcs/0002-embed-security-model.md § 1. The list is the whole control:
 * a `frame-ancestors` directive is built from it, and an origin that reaches
 * this table can frame a payment page.
 *
 * Per page rather than per project, so a merchant running a storefront and a
 * members' area does not have one leak framing rights to the other.
 *
 * ## Nothing here parses an origin
 *
 * `parseEmbedOrigin` in `@checkout-studio/utils` decides what an origin is,
 * and the service above calls it. Validating again here would be a second
 * answer to a question that already has one — and the two would drift, which
 * for this table means a row that saves and then frames nothing.
 *
 * What this does guarantee is the shape of the *list*: no duplicates, and
 * never more than the ceiling.
 */

/**
 * Reachable only through a page in a project the tenant owns.
 *
 * Written as a filter on the relation rather than a lookup of the page
 * first, so there is one query and no window between checking ownership and
 * acting on it.
 */
const ownedBy = (tenant: TenantContext, projectId: string) => ({
  page: { projectId, deletedAt: null, project: { userId: tenant.userId, deletedAt: null } },
})

export interface StoredEmbedOrigin {
  id: string
  origin: string
  verified: boolean
  createdAt: Date
}

export type OriginAdded =
  | { ok: true; origin: StoredEmbedOrigin }
  /** Already registered for this page. */
  | { ok: false; reason: "duplicate" }
  /** The list is full. See `MAX_EMBED_ORIGINS`. */
  | { ok: false; reason: "at-capacity" }
  /** No such page, or not one this caller owns. */
  | { ok: false; reason: "not-found" }

const COLUMNS = { id: true, origin: true, verified: true, createdAt: true } as const

export const embedOriginRepository = {
  /**
   * Every origin registered for a page, oldest first.
   *
   * Registration order, because it is the order a merchant added them in and
   * the one they will look for. The header does not use this ordering —
   * `frameAncestors` sorts — so nothing downstream depends on it.
   */
  async list(tenant: TenantContext, pageId: string): Promise<readonly StoredEmbedOrigin[]> {
    const projectId = requireProject(tenant, "EmbedOrigin")

    return prisma.embedOrigin.findMany({
      where: { pageId, ...ownedBy(tenant, projectId) },
      orderBy: { createdAt: "asc" },
      select: COLUMNS,
    })
  },

  /**
   * Registers one origin, up to the ceiling.
   *
   * In a transaction, because the ceiling is a statement about the list and
   * not about the row: two requests that each counted nineteen would each
   * insert, and the list would hold twenty-one. Serializable rather than the
   * default, since a count is exactly the read a concurrent insert
   * invalidates.
   *
   * `verified` is false and is not a parameter. It becomes true when Stripe's
   * payment method domain verification passes, which is something observed
   * rather than something a caller asserts.
   */
  async add(
    tenant: TenantContext,
    pageId: string,
    origin: string,
    ceiling: number,
  ): Promise<OriginAdded> {
    const projectId = requireProject(tenant, "EmbedOrigin")

    return prisma.$transaction(
      async (tx): Promise<OriginAdded> => {
        const page = await tx.page.findFirst({
          where: { id: pageId, projectId, deletedAt: null, project: { userId: tenant.userId } },
          select: { id: true },
        })

        if (page === null) return { ok: false, reason: "not-found" }

        const existing = await tx.embedOrigin.findUnique({
          where: { pageId_origin: { pageId, origin } },
          select: { id: true },
        })

        if (existing !== null) return { ok: false, reason: "duplicate" }

        if ((await tx.embedOrigin.count({ where: { pageId } })) >= ceiling) {
          return { ok: false, reason: "at-capacity" }
        }

        return {
          ok: true,
          origin: await tx.embedOrigin.create({ data: { pageId, origin }, select: COLUMNS }),
        }
      },
      { isolationLevel: "Serializable" },
    )
  },

  /**
   * Takes one origin off the list. False when it was not there.
   *
   * By id and not by origin, because the row a merchant pressed delete on is
   * the row they meant, and a list they are editing can be stale.
   */
  async remove(tenant: TenantContext, pageId: string, id: string): Promise<boolean> {
    const projectId = requireProject(tenant, "EmbedOrigin")

    const { count } = await prisma.embedOrigin.deleteMany({
      where: { id, pageId, ...ownedBy(tenant, projectId) },
    })

    return count === 1
  },
}
