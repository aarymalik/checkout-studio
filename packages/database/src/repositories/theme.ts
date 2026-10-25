import "server-only"

import { type Prisma, prisma } from "../client"
import { requireProject, TenantScopeError, type TenantContext } from "../tenant"

/**
 * A project's theme.
 *
 * ## One row, made when it is first needed
 *
 * A project begins with none. `resolveTheme` says so in as many words — "a
 * project with no themes yet is the common case, not an error" — and hands
 * back the system default, which is a coherent theme that every page can
 * render against.
 *
 * The row appears the first time somebody changes something. That is what the
 * default theme's own note describes: "the real timestamps are written when a
 * project creates its own theme from this one."
 *
 * ## Two ids, doing different work
 *
 * The row's `id` is unique across the database and is how storage finds it.
 * The `id` inside `tokens` is logical: it is what a page's document
 * references, and it is only ever looked up among one project's own rows. Two
 * projects may both hold a theme called `theme_default` and never meet.
 *
 * ## The row is complete, not a delta
 *
 * It holds a whole `CheckoutTheme`, seeded from the default. It would be
 * tidier to store only what differs and let it extend `theme_default`, and it
 * would not work: `flatten` resolves a chain strictly by id against the rows
 * handed to it, and the default is not a row. A theme extending it would fail
 * to resolve and fall back to the very thing it was extending.
 *
 * Inheritance is for presets and brand kits, which are later phases and will
 * extend *this* row rather than the default.
 */

/** Why a save was refused, when it was. */
export class ThemeConflictError extends Error {
  override readonly name = "ThemeConflictError"

  constructor(readonly projectId: string) {
    super(`The theme for project ${projectId} was changed by another session`)
  }
}

/** A theme is reachable only through a project the tenant owns. */
const ownedBy = (tenant: TenantContext) => ({
  project: { userId: tenant.userId, deletedAt: null },
})

export const themeRepository = {
  /** Every theme the project holds. Today that is one or none. */
  async list(tenant: TenantContext) {
    const projectId = requireProject(tenant, "Theme")

    return prisma.theme.findMany({
      where: { projectId, ...ownedBy(tenant) },
      orderBy: { createdAt: "asc" },
    })
  },

  /**
   * The project's own theme, or nothing.
   *
   * The first row, not a named one. A project has at most one until presets
   * arrive, and asking by name would mean inventing a name to ask for.
   */
  async forProject(tenant: TenantContext) {
    const projectId = requireProject(tenant, "Theme")

    return prisma.theme.findFirst({
      where: { projectId, ...ownedBy(tenant) },
      orderBy: { createdAt: "asc" },
    })
  },

  /**
   * Writes the project's theme, creating the row if this is the first change.
   *
   * `updatedAt` is checked when the caller knows what it last read. Two people
   * with the panel open would otherwise take turns overwriting each other's
   * whole theme, and a theme is one row — there is no field-level merge to
   * save them. A caller that passes nothing is saying it does not care, which
   * is right for a first write and wrong for an edit.
   */
  async save(
    tenant: TenantContext,
    tokens: Prisma.InputJsonValue,
    expected?: { name?: string; updatedAt?: Date },
  ) {
    const projectId = requireProject(tenant, "Theme")
    const existing = await this.forProject(tenant)

    if (existing === null) {
      /*
       * The project is checked before anything is written, and this is the one
       * place that needs saying out loud.
       *
       * Every read here scopes on the owner, so somebody else's project reads
       * as a project with no theme — which is the right answer for a read and
       * the wrong premise for a write. Creating on that answer would put a row
       * into a project the caller does not own. Invisible is not the same as
       * absent.
       */
      const owned = await prisma.project.findFirst({
        where: { id: projectId, userId: tenant.userId, deletedAt: null },
        select: { id: true },
      })

      if (owned === null) throw new TenantScopeError("Theme", `project ${projectId} is not yours`)

      return prisma.theme.create({
        data: { projectId, name: expected?.name ?? "Theme", tokens },
      })
    }

    if (expected?.updatedAt !== undefined && expected.updatedAt < existing.updatedAt) {
      throw new ThemeConflictError(projectId)
    }

    return prisma.theme.update({
      where: { id: existing.id },
      data: { tokens, ...(expected?.name === undefined ? {} : { name: expected.name }) },
    })
  },
}
