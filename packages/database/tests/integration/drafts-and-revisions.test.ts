import { beforeEach, describe, expect, it } from "vitest"
import { databaseMessage } from "@checkout-studio/utils"
import { createTenant, prisma, truncateAll } from "../helpers"
import { projectRepository } from "../../src/repositories/project"
import { pageRepository, DraftConflictError } from "../../src/repositories/page"
import { revisionRepository } from "../../src/repositories/revision"

beforeEach(truncateAll)

async function aPage() {
  const tenant = await createTenant()
  const project = await projectRepository.create(tenant, { name: "P", slug: "p" })
  const scoped = { ...tenant, projectId: project.id }
  const page = await pageRepository.create(scoped, {
    title: "Checkout",
    slug: "checkout",
    draftSchema: { version: "1.0.0", nodes: {} },
  })
  return { tenant: scoped, page }
}

describe("draft concurrency", () => {
  it("writes the draft and advances the version", async () => {
    const { tenant, page } = await aPage()

    const result = await pageRepository.saveDraft(tenant, page.id, 0, { nodes: { a: {} } })

    expect(result?.draftVersion).toBe(1)
  })

  it("rejects a write based on a stale version", async () => {
    const { tenant, page } = await aPage()
    await pageRepository.saveDraft(tenant, page.id, 0, { nodes: { a: {} } })

    // A second session that still believes the draft is at version 0.
    await expect(
      pageRepository.saveDraft(tenant, page.id, 0, { nodes: { b: {} } }),
    ).rejects.toThrow(DraftConflictError)
  })

  it("reports which version the caller expected and what it found", async () => {
    const { tenant, page } = await aPage()
    await pageRepository.saveDraft(tenant, page.id, 0, { nodes: {} })

    try {
      await pageRepository.saveDraft(tenant, page.id, 0, { nodes: {} })
      expect.unreachable("should have conflicted")
    } catch (error) {
      expect((error as DraftConflictError).expectedVersion).toBe(0)
      expect((error as DraftConflictError).actualVersion).toBe(1)
    }
  })

  it("lets only one of two concurrent writers win", async () => {
    const { tenant, page } = await aPage()

    const results = await Promise.allSettled([
      pageRepository.saveDraft(tenant, page.id, 0, { nodes: { a: {} } }),
      pageRepository.saveDraft(tenant, page.id, 0, { nodes: { b: {} } }),
    ])

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1)

    const after = await pageRepository.findById(tenant, page.id)
    expect(after?.draftVersion).toBe(1)
  })

  it("returns null for a page the tenant cannot see, rather than conflicting", async () => {
    const { page } = await aPage()
    const stranger = await createTenant()

    expect(await pageRepository.saveDraft(stranger, page.id, 0, { nodes: {} })).toBeNull()
  })

  it("autosave creates no revision", async () => {
    const { tenant, page } = await aPage()
    await pageRepository.saveDraft(tenant, page.id, 0, { nodes: {} })

    expect(await revisionRepository.list(tenant, page.id)).toHaveLength(0)
  })
})

describe("revisions", () => {
  const input = {
    kind: "publish" as const,
    schema: { version: "1.0.0", nodes: {} },
    theme: { colors: { primary: "#2563EB" } },
    schemaVersion: "1.0.0",
    rendererVersion: "1.0.0",
    createdBy: "test",
  }

  it("numbers revisions sequentially per page", async () => {
    const { tenant, page } = await aPage()

    const first = await revisionRepository.create(tenant, { ...input, pageId: page.id })
    const second = await revisionRepository.create(tenant, { ...input, pageId: page.id })

    expect(first?.number).toBe(1)
    expect(second?.number).toBe(2)
  })

  it("snapshots the theme alongside the schema", async () => {
    const { tenant, page } = await aPage()

    const revision = await revisionRepository.create(tenant, { ...input, pageId: page.id })

    expect(revision?.theme).toEqual({ colors: { primary: "#2563EB" } })
  })

  it("points the page at the newest revision", async () => {
    const { tenant, page } = await aPage()
    const revision = await revisionRepository.create(tenant, { ...input, pageId: page.id })

    const after = await pageRepository.findById(tenant, page.id)
    expect(after?.currentRevisionId).toBe(revision?.id)
  })

  it("refuses to create a revision on another tenant's page", async () => {
    const { page } = await aPage()
    const stranger = await createTenant()

    expect(await revisionRepository.create(stranger, { ...input, pageId: page.id })).toBeNull()
  })

  it("is immutable: the database refuses an update", async () => {
    const { tenant, page } = await aPage()
    const revision = await revisionRepository.create(tenant, { ...input, pageId: page.id })

    const error = await prisma.revision
      .update({ where: { id: revision!.id }, data: { name: "tampered" } })
      .catch((e: unknown) => e)

    expect(databaseMessage(error)).toMatch(/immutable/)
  })
})
