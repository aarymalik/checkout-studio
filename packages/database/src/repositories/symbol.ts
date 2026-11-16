import { prisma } from "../client"
import type { Prisma } from "../client"
import { TenantScopeError, requireProject, type TenantContext } from "../tenant"

/**
 * Symbol definitions, which belong to a project and never to a page.
 *
 * docs/schema.md § Symbols: a page places a symbol with an instance node and
 * the definition lives here. That separation is what makes "editing a symbol
 * changes every instance" true by construction — there is one copy, so there
 * is nothing to fan out and nothing to be half done.
 *
 * The row is a named `Fragment`: `rootNodeId` and `nodes` are exactly what
 * `@checkout-studio/schema` calls `rootId` and `nodes`, which is why
 * `detachSymbol` takes one straight out of here.
 *
 * ## The version changes when what renders changes
 *
 * Bumped on a subtree write and not on a rename, because a name is not
 * something a page draws. Anything caching an expansion can key on it and be
 * right, which is the only reason the column is worth keeping accurate.
 *
 * ## Deleting is not refused here
 *
 * Whether anything still places this symbol is answered by walking the
 * project's documents, which is a service's job and not a row's — the asset
 * library draws the same line for the same reason. This deletes; something
 * above it decides whether it should.
 */

/**
 * A symbol is reachable only through a project the tenant owns.
 *
 * No `deletedAt`: a symbol has no soft delete, because the thing a soft
 * delete protects against — bytes that cannot be put back — does not apply
 * to a row holding a subtree. What it is protected by instead is a refusal
 * to delete one that pages still place, and that lives above this.
 */
const ownedBy = (tenant: TenantContext) => ({
  project: { userId: tenant.userId, deletedAt: null },
})

export interface StoredSymbol {
  id: string
  name: string
  version: string
  /** The id of the subtree's top node, within `nodes`. */
  rootNodeId: string
  nodes: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}

export interface NewSymbol {
  name: string
  rootNodeId: string
  nodes: Prisma.InputJsonValue
}

const COLUMNS = {
  id: true,
  name: true,
  version: true,
  rootNodeId: true,
  nodes: true,
  createdAt: true,
  updatedAt: true,
} as const

export const symbolRepository = {
  /** Every symbol the project has, for a library panel. */
  async list(tenant: TenantContext): Promise<readonly StoredSymbol[]> {
    const projectId = requireProject(tenant, "Symbol")

    return prisma.symbol.findMany({
      where: { projectId, ...ownedBy(tenant) },
      orderBy: { name: "asc" },
      select: COLUMNS,
    })
  },

  async findById(tenant: TenantContext, id: string): Promise<StoredSymbol | null> {
    return prisma.symbol.findFirst({ where: { id, ...ownedBy(tenant) }, select: COLUMNS })
  },

  async create(tenant: TenantContext, input: NewSymbol): Promise<StoredSymbol> {
    const projectId = requireProject(tenant, "Symbol")

    /*
     * Ownership before the write, for the reason themeRepository states:
     * every read here scopes on the owner, so somebody else's project reads
     * as an empty one — the right answer for a read and the wrong premise
     * for a write.
     */
    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId: tenant.userId, deletedAt: null },
      select: { id: true },
    })

    if (owned === null) throw new TenantScopeError("Symbol", `project ${projectId} is not yours`)

    return prisma.symbol.create({
      data: {
        projectId,
        name: input.name,
        rootNodeId: input.rootNodeId,
        nodes: input.nodes,
      },
      select: COLUMNS,
    })
  },

  /**
   * Writes a symbol's subtree, and moves its version on.
   *
   * Every page placing it renders the new one, which is the point of a
   * symbol and the reason this is one write rather than a loop over pages.
   */
  async saveSubtree(
    tenant: TenantContext,
    id: string,
    subtree: { rootNodeId: string; nodes: Prisma.InputJsonValue },
  ): Promise<StoredSymbol | null> {
    const existing = await this.findById(tenant, id)

    if (existing === null) return null

    return prisma.symbol.update({
      where: { id },
      data: {
        rootNodeId: subtree.rootNodeId,
        nodes: subtree.nodes,
        version: nextPatch(existing.version),
      },
      select: COLUMNS,
    })
  },

  /** Renaming changes nothing a page draws, so the version stays. */
  async rename(tenant: TenantContext, id: string, name: string): Promise<StoredSymbol | null> {
    const existing = await this.findById(tenant, id)

    if (existing === null) return null

    return prisma.symbol.update({ where: { id }, data: { name }, select: COLUMNS })
  },

  /** Answers false for a symbol that was not this tenant's to delete. */
  async remove(tenant: TenantContext, id: string): Promise<boolean> {
    const existing = await this.findById(tenant, id)

    if (existing === null) return false

    await prisma.symbol.delete({ where: { id } })

    return true
  },
}

/**
 * The next patch version.
 *
 * Patch rather than minor: a symbol's edits are not a release, and the only
 * thing reading this is a cache deciding whether what it holds is still the
 * symbol. A version that does not parse is replaced rather than guessed at,
 * because a cache key that stops changing is worse than one that jumps.
 */
function nextPatch(version: string): string {
  const parts = version.split(".").map(Number)
  const [major, minor, patch] = parts

  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return "1.0.1"

  return `${String(major)}.${String(minor)}.${String((patch as number) + 1)}`
}
