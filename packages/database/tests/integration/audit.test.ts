import { beforeEach, describe, expect, it } from "vitest"
import { databaseMessage } from "@checkout-studio/utils"
import { createTenant, prisma, truncateAll } from "../helpers"
import { projectRepository } from "../../src/repositories/project"
import { auditRepository } from "../../src/repositories/audit"

beforeEach(truncateAll)

describe("audit log", () => {
  it("records an action with its actor and correlation id", async () => {
    const tenant = { ...(await createTenant()), correlationId: "req_abc" }
    const project = await projectRepository.create(tenant, { name: "P", slug: "p" })

    await auditRepository.record(
      { ...tenant, projectId: project.id },
      { action: "project.created", entityType: "Project", entityId: project.id },
    )

    const [entry] = await auditRepository.listForProject(tenant, project.id)
    expect(entry?.action).toBe("project.created")
    expect(entry?.actorId).toBe(tenant.userId)
    expect(entry?.requestId).toBe("req_abc")
  })

  it("is append-only: the database refuses an update", async () => {
    const tenant = await createTenant()
    await auditRepository.record(tenant, { action: "test", entityType: "T" })
    const [entry] = await prisma.auditLog.findMany()

    // Prisma leaves the top-level message empty for trigger violations; the
    // database's own words live in the adapter error.
    const error = await prisma.auditLog
      .update({ where: { id: entry!.id }, data: { action: "tampered" } })
      .catch((e: unknown) => e)

    expect(databaseMessage(error)).toMatch(/append-only/)
  })

  it("is append-only: the database refuses a delete", async () => {
    const tenant = await createTenant()
    await auditRepository.record(tenant, { action: "test", entityType: "T" })
    const [entry] = await prisma.auditLog.findMany()

    const error = await prisma.auditLog
      .delete({ where: { id: entry!.id } })
      .catch((e: unknown) => e)

    expect(databaseMessage(error)).toMatch(/append-only/)
  })

  it("does not expose another tenant's audit trail", async () => {
    const alice = await createTenant()
    const bob = await createTenant()
    const project = await projectRepository.create(alice, { name: "A", slug: "a" })

    await auditRepository.record(
      { ...alice, projectId: project.id },
      { action: "project.created", entityType: "Project" },
    )

    expect(await auditRepository.listForProject(bob, project.id)).toHaveLength(0)
  })
})
