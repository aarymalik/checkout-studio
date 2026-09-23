import "server-only"

import { type Prisma, prisma } from "../client"
import type { TenantContext } from "../tenant"

/**
 * The audit log.
 *
 * Append-only, enforced by database triggers rather than by convention — see
 * the append_only_audit_log migration. There is deliberately no update or
 * delete method here, because there is no such operation.
 */

export type ActorType = "user" | "staff" | "system"

export interface AuditEntry {
  action: string
  entityType: string
  entityId?: string
  projectId?: string
  actorId?: string
  actorType?: ActorType
  metadata?: Prisma.InputJsonValue
  ip?: string
  requestId?: string
}

export const auditRepository = {
  /**
   * Records an action.
   *
   * Never throws into the caller's path: an audit write that fails must not
   * fail the operation it was recording. It is reported instead.
   */
  async record(tenant: TenantContext, entry: AuditEntry): Promise<void> {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        ...(entry.entityId ? { entityId: entry.entityId } : {}),
        ...((entry.projectId ?? tenant.projectId)
          ? { projectId: entry.projectId ?? tenant.projectId }
          : {}),
        actorId: entry.actorId ?? tenant.userId,
        actorType: entry.actorType ?? "user",
        ...(entry.metadata ? { metadata: entry.metadata } : {}),
        ...(entry.ip ? { ip: entry.ip } : {}),
        ...((entry.requestId ?? tenant.correlationId)
          ? { requestId: entry.requestId ?? tenant.correlationId }
          : {}),
      },
    })
  },

  async listForProject(tenant: TenantContext, projectId: string, limit = 100) {
    // Only a project the tenant owns has an audit trail they may read.
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: tenant.userId },
      select: { id: true },
    })

    if (!project) return []

    return prisma.auditLog.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  },
}
