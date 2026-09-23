/**
 * Tenant scoping.
 *
 * Every repository method takes this. Multi-tenancy is not optional and is not
 * the caller's responsibility to remember: a repository that cannot identify
 * the tenant cannot run the query.
 *
 * See docs/database.md and docs/security.md.
 */
export interface TenantContext {
  /** The authenticated user. Every row this request may touch belongs to them. */
  userId: string
  /** Present when the operation is scoped to one project. */
  projectId?: string
  /** Ties database work to the request's logs and traces. */
  correlationId?: string
}

export class TenantScopeError extends Error {
  override readonly name = "TenantScopeError"

  constructor(entity: string, detail: string) {
    super(`Tenant scope violation on ${entity}: ${detail}`)
  }
}

/**
 * Asserts that a context carries a project, for repositories whose every row
 * belongs to one.
 */
export function requireProject(tenant: TenantContext, entity: string): string {
  if (!tenant.projectId) {
    throw new TenantScopeError(entity, "a projectId is required for this operation")
  }
  return tenant.projectId
}
