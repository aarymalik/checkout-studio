import { prisma } from "../client"
import type { Prisma } from "../client"
import { TenantScopeError, requireProject, type TenantContext } from "../tenant"

/**
 * The templates somebody can install.
 *
 * Two kinds in one table, which is what `projectId` being nullable means: a
 * template a project made, and a public one that belongs to nobody. A
 * listing is the union — your own plus everyone's — because that is the
 * single question the library panel asks, and answering it in two queries
 * would mean paging two lists that have to interleave.
 *
 * ## Visible is not the same as yours
 *
 * A public template is readable by every installation and writable by none
 * of them through here. Ownership is checked before anything is written, for
 * the reason themeRepository states: a read scoped on the owner makes
 * somebody else's project look empty, which is the right answer for a read
 * and the wrong premise for a write.
 *
 * ## Searching is a filter, not a ranking
 *
 * `search` narrows by name, description and tags, and the order stays the
 * one the listing already has. A relevance score is a thing to tune, and
 * nobody can tune one until there are templates to tune it against —
 * docs/template-system.md § Search asks for search, and this is search.
 */

export interface StoredTemplate {
  id: string
  /** Null for a public template, which belongs to no project. */
  projectId: string | null
  name: string
  slug: string
  category: string
  description: string | null
  thumbnailUrl: string | null
  tags: string[]
  version: string
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
}

export interface NewTemplate {
  name: string
  slug: string
  category: string
  description?: string
  thumbnailUrl?: string
  tags?: string[]
  schema: Prisma.InputJsonValue
  theme: Prisma.InputJsonValue
}

export interface TemplateQuery {
  /** One category, or every one. */
  category?: string
  /** Narrows by name, description and tags. Case is ignored. */
  search?: string
  /** Every tag has to be present, not any of them. */
  tags?: readonly string[]
}

const COLUMNS = {
  id: true,
  projectId: true,
  name: true,
  slug: true,
  category: true,
  description: true,
  thumbnailUrl: true,
  tags: true,
  version: true,
  isPublic: true,
  createdAt: true,
  updatedAt: true,
} as const

/**
 * What this caller may see: their project's templates and the public ones.
 *
 * `projectId` is checked through the project's owner rather than taken from
 * the tenant, so a project that was deleted takes its templates out of every
 * listing without anything having to remember to.
 */
const visibleTo = (tenant: TenantContext): Prisma.TemplateWhereInput => ({
  deletedAt: null,
  OR: [{ isPublic: true }, { project: { userId: tenant.userId, deletedAt: null } }],
})

export const templateRepository = {
  /**
   * The library, newest first.
   *
   * Recently made is the closest thing to useful this can be on its own;
   * "recently used" is a different list and needs somewhere to record a use.
   */
  async list(tenant: TenantContext, query: TemplateQuery = {}): Promise<readonly StoredTemplate[]> {
    return prisma.template.findMany({
      /*
       * Combined with AND rather than spread together. Both halves use OR —
       * visibility is "public or mine", search is "name or description or
       * tag" — and spreading would let the second overwrite the first, which
       * is a search that returns everybody's templates.
       */
      where: { AND: [visibleTo(tenant), narrow(query)] },
      orderBy: { createdAt: "desc" },
      select: COLUMNS,
    })
  },

  /** One template, or null when it is not there or not visible. */
  async findById(tenant: TenantContext, id: string): Promise<StoredTemplate | null> {
    return prisma.template.findFirst({ where: { id, ...visibleTo(tenant) }, select: COLUMNS })
  },

  /**
   * What a template holds, for installing it.
   *
   * Separate from the listing because a library panel draws fifty cards and
   * needs none of it, and a schema is the largest column in the row.
   */
  async contents(
    tenant: TenantContext,
    id: string,
  ): Promise<{ schema: Prisma.JsonValue; theme: Prisma.JsonValue } | null> {
    return prisma.template.findFirst({
      where: { id, ...visibleTo(tenant) },
      select: { schema: true, theme: true },
    })
  },

  /** The categories that have something in them, for a filter that cannot be empty. */
  async categories(tenant: TenantContext): Promise<readonly string[]> {
    const rows = await prisma.template.findMany({
      where: visibleTo(tenant),
      distinct: ["category"],
      orderBy: { category: "asc" },
      select: { category: true },
    })

    return rows.map((row) => row.category)
  },

  async create(tenant: TenantContext, input: NewTemplate): Promise<StoredTemplate> {
    const projectId = requireProject(tenant, "Template")

    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId: tenant.userId, deletedAt: null },
      select: { id: true },
    })

    if (owned === null) throw new TenantScopeError("Template", `project ${projectId} is not yours`)

    return prisma.template.create({
      data: {
        projectId,
        name: input.name,
        slug: input.slug,
        category: input.category,
        description: input.description ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        tags: input.tags ?? [],
        schema: input.schema,
        theme: input.theme,
      },
      select: COLUMNS,
    })
  },

  /**
   * Takes one out of the library without destroying it.
   *
   * Soft, because a template is somebody's work and the row carries the only
   * copy of it. Answers false for a public one: visible is not the same as
   * yours, and deleting through a listing everybody can see would be a
   * surprise with no undo.
   */
  async softDelete(tenant: TenantContext, id: string): Promise<boolean> {
    const { count } = await prisma.template.updateMany({
      where: {
        id,
        deletedAt: null,
        project: { userId: tenant.userId, deletedAt: null },
      },
      data: { deletedAt: new Date() },
    })

    return count > 0
  },
}

/** The parts of a query that are a `where`, which is all of them. */
function narrow(query: TemplateQuery): Prisma.TemplateWhereInput {
  const where: Prisma.TemplateWhereInput = {}

  if (query.category !== undefined) where.category = query.category

  // Every tag, not any: a filter that widened as you added to it would be
  // the opposite of what picking a second tag means.
  if (query.tags !== undefined && query.tags.length > 0) where.tags = { hasEvery: [...query.tags] }

  if (query.search !== undefined && query.search.trim() !== "") {
    const term = query.search.trim()

    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { tags: { has: term } },
    ]
  }

  return where
}
