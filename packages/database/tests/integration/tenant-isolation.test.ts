import { beforeEach, describe, expect, it } from "vitest"
import { createTenant, prisma, truncateAll } from "../helpers"
import { projectRepository } from "../../src/repositories/project"
import { pageRepository } from "../../src/repositories/page"

/**
 * The guarantee that matters most: one tenant can never reach another's rows.
 *
 * Tested by creating two tenants and actually trying, rather than by reading
 * the queries and believing them.
 */
beforeEach(truncateAll)

describe("tenant isolation", () => {
  it("does not list another tenant's projects", async () => {
    const alice = await createTenant()
    const bob = await createTenant()

    await projectRepository.create(alice, { name: "Alice Co", slug: "alice-co" })

    expect(await projectRepository.list(alice)).toHaveLength(1)
    expect(await projectRepository.list(bob)).toHaveLength(0)
  })

  it("returns null rather than another tenant's project by id", async () => {
    const alice = await createTenant()
    const bob = await createTenant()
    const project = await projectRepository.create(alice, { name: "Alice", slug: "alice" })

    // Not "forbidden" — invisible. A 404 reveals nothing about what exists.
    expect(await projectRepository.findById(bob, project.id)).toBeNull()
  })

  it("refuses to update another tenant's project", async () => {
    const alice = await createTenant()
    const bob = await createTenant()
    const project = await projectRepository.create(alice, { name: "Alice", slug: "alice" })

    expect(await projectRepository.update(bob, project.id, { name: "Owned" })).toBeNull()

    const unchanged = await projectRepository.findById(alice, project.id)
    expect(unchanged?.name).toBe("Alice")
  })

  it("refuses to delete another tenant's project", async () => {
    const alice = await createTenant()
    const bob = await createTenant()
    const project = await projectRepository.create(alice, { name: "Alice", slug: "alice" })

    expect(await projectRepository.softDelete(bob, project.id)).toBe(false)
    expect(await projectRepository.findById(alice, project.id)).not.toBeNull()
  })

  it("does not reach another tenant's pages", async () => {
    const alice = await createTenant()
    const bob = await createTenant()
    const project = await projectRepository.create(alice, { name: "Alice", slug: "alice" })

    const page = await pageRepository.create(
      { ...alice, projectId: project.id },
      { title: "Checkout", slug: "checkout", draftSchema: { nodes: {} } },
    )

    expect(await pageRepository.findById(bob, page.id)).toBeNull()
    expect(await pageRepository.list({ ...bob, projectId: project.id })).toHaveLength(0)
  })

  it("requires a project for page operations that need one", async () => {
    const alice = await createTenant()

    await expect(pageRepository.list(alice)).rejects.toThrow(/projectId is required/)
  })
})

describe("soft delete", () => {
  it("hides a deleted project but keeps the row", async () => {
    const alice = await createTenant()
    const project = await projectRepository.create(alice, { name: "Alice", slug: "alice" })

    await projectRepository.softDelete(alice, project.id)

    expect(await projectRepository.list(alice)).toHaveLength(0)
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull()
  })

  it("restores a deleted project", async () => {
    const alice = await createTenant()
    const project = await projectRepository.create(alice, { name: "Alice", slug: "alice" })
    await projectRepository.softDelete(alice, project.id)

    expect(await projectRepository.restore(alice, project.id)).toBe(true)
    expect(await projectRepository.list(alice)).toHaveLength(1)
  })
})
