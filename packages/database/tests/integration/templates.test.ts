import { beforeEach, describe, expect, it } from "vitest"

import { templateRepository, TenantScopeError } from "../../src"
import type { NewTemplate, TenantContext } from "../../src"
import { createTenant, prisma, truncateAll } from "../helpers"

/**
 * The templates somebody can install.
 *
 * Two kinds in one table — a project's own and a public one belonging to
 * nobody — so most of these are about the line between them: what a listing
 * includes, and what a write is allowed to touch.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

function aTemplate(over: Partial<NewTemplate> = {}): NewTemplate {
  counter += 1

  return {
    name: "Spring sale",
    slug: `spring-${String(counter)}`,
    category: "checkout",
    tags: ["seasonal"],
    schema: { version: "1.0.0" },
    theme: { id: "theme_default" },
    ...over,
  }
}

async function aProject(userId: string): Promise<string> {
  counter += 1

  const project = await prisma.project.create({
    data: { userId, name: "Test", slug: `test-${String(Date.now())}-${String(counter)}` },
  })

  return project.id
}

/** A template belonging to nobody, as the catalogue ships them. */
async function aPublicTemplate(name: string, over: Record<string, unknown> = {}): Promise<string> {
  counter += 1

  const row = await prisma.template.create({
    data: {
      name,
      slug: `public-${String(counter)}`,
      category: "starter",
      tags: [],
      schema: {},
      theme: {},
      isPublic: true,
      ...over,
    },
    select: { id: true },
  })

  return row.id
}

beforeEach(async () => {
  await truncateAll()

  const owner = await createTenant()

  tenant = { ...owner, projectId: await aProject(owner.userId) }
})

describe("what a listing includes", () => {
  it("is this project's own templates", async () => {
    await templateRepository.create(tenant, aTemplate({ name: "Mine" }))

    expect((await templateRepository.list(tenant)).map((row) => row.name)).toEqual(["Mine"])
  })

  it("is the public ones as well, in one list", async () => {
    // The single question a library panel asks. Two queries would mean two
    // lists that have to interleave.
    await templateRepository.create(tenant, aTemplate({ name: "Mine" }))
    await aPublicTemplate("Theirs")

    expect((await templateRepository.list(tenant)).map((row) => row.name).sort()).toEqual([
      "Mine",
      "Theirs",
    ])
  })

  it("is not somebody else's private ones", async () => {
    const other = await createTenant()
    const theirs = { ...other, projectId: await aProject(other.userId) }

    await templateRepository.create(theirs, aTemplate({ name: "Theirs" }))

    expect(await templateRepository.list(tenant)).toEqual([])
  })

  it("is not one that was deleted", async () => {
    const created = await templateRepository.create(tenant, aTemplate())

    await templateRepository.softDelete(tenant, created.id)

    expect(await templateRepository.list(tenant)).toEqual([])
  })

  it("loses a project's templates when the project goes", async () => {
    // Checked through the project's owner rather than taken from the
    // tenant, so a deleted project takes its templates out of every listing
    // without anything having to remember to.
    await templateRepository.create(tenant, aTemplate())
    await prisma.project.update({
      where: { id: tenant.projectId },
      data: { deletedAt: new Date() },
    })

    expect(await templateRepository.list(tenant)).toEqual([])
  })
})

describe("narrowing the library", () => {
  it("by category", async () => {
    await templateRepository.create(tenant, aTemplate({ name: "A", category: "checkout" }))
    await templateRepository.create(tenant, aTemplate({ name: "B", category: "upsell" }))

    const found = await templateRepository.list(tenant, { category: "upsell" })

    expect(found.map((row) => row.name)).toEqual(["B"])
  })

  it("by every tag rather than any of them", async () => {
    /*
     * A filter that widened as you added to it would be the opposite of
     * what picking a second tag means.
     */
    await templateRepository.create(tenant, aTemplate({ name: "Both", tags: ["a", "b"] }))
    await templateRepository.create(tenant, aTemplate({ name: "One", tags: ["a"] }))

    const found = await templateRepository.list(tenant, { tags: ["a", "b"] })

    expect(found.map((row) => row.name)).toEqual(["Both"])
  })

  it("by name, ignoring case", async () => {
    await templateRepository.create(tenant, aTemplate({ name: "Spring sale" }))
    await templateRepository.create(tenant, aTemplate({ name: "Winter" }))

    expect(
      (await templateRepository.list(tenant, { search: "SPRING" })).map((r) => r.name),
    ).toEqual(["Spring sale"])
  })

  it("by description and by tag", async () => {
    await templateRepository.create(
      tenant,
      aTemplate({ name: "A", description: "for a flash sale" }),
    )
    await templateRepository.create(tenant, aTemplate({ name: "B", tags: ["minimal"] }))

    expect((await templateRepository.list(tenant, { search: "flash" })).map((r) => r.name)).toEqual(
      ["A"],
    )
    expect(
      (await templateRepository.list(tenant, { search: "minimal" })).map((r) => r.name),
    ).toEqual(["B"])
  })

  it("never widens past what the caller may see", async () => {
    /*
     * The one that matters. Visibility is "public or mine" and search is
     * "name or description or tag", and two ORs spread into one object let
     * the second replace the first — a search that returns everybody's
     * templates.
     */
    const other = await createTenant()
    const theirs = { ...other, projectId: await aProject(other.userId) }

    await templateRepository.create(theirs, aTemplate({ name: "Spring secret" }))

    expect(await templateRepository.list(tenant, { search: "Spring" })).toEqual([])
  })

  it("is unbothered by a search of nothing but spaces", async () => {
    await templateRepository.create(tenant, aTemplate({ name: "Mine" }))

    expect((await templateRepository.list(tenant, { search: "   " })).map((r) => r.name)).toEqual([
      "Mine",
    ])
  })
})

describe("the categories a filter can offer", () => {
  it("are the ones with something in them, each once", async () => {
    await templateRepository.create(tenant, aTemplate({ category: "checkout" }))
    await templateRepository.create(tenant, aTemplate({ category: "checkout" }))
    await aPublicTemplate("Starter", { category: "starter" })

    expect(await templateRepository.categories(tenant)).toEqual(["checkout", "starter"])
  })

  it("leave out a category only somebody else's templates are in", async () => {
    const other = await createTenant()
    const theirs = { ...other, projectId: await aProject(other.userId) }

    await templateRepository.create(theirs, aTemplate({ category: "secret" }))

    expect(await templateRepository.categories(tenant)).toEqual([])
  })
})

describe("what a template holds", () => {
  it("is fetched apart from the listing", async () => {
    // A library panel draws fifty cards and needs none of it, and a schema
    // is the largest column in the row.
    const created = await templateRepository.create(tenant, aTemplate())

    expect(await templateRepository.contents(tenant, created.id)).toEqual({
      // The name comes with it, so installing is one read rather than two
      // questions a template deleted in between can answer differently.
      name: "Spring sale",
      schema: { version: "1.0.0" },
      theme: { id: "theme_default" },
    })
  })

  it("is readable for a public one", async () => {
    const id = await aPublicTemplate("Starter")

    expect(await templateRepository.contents(tenant, id)).not.toBeNull()
  })

  it("is nothing for somebody else's", async () => {
    const other = await createTenant()
    const theirs = { ...other, projectId: await aProject(other.userId) }
    const created = await templateRepository.create(theirs, aTemplate())

    expect(await templateRepository.contents(tenant, created.id)).toBeNull()
  })
})

describe("writing one", () => {
  it("refuses a project that is not the caller's", async () => {
    const stranger = { userId: "usr_nobody", projectId: tenant.projectId }

    await expect(templateRepository.create(stranger, aTemplate())).rejects.toBeInstanceOf(
      TenantScopeError,
    )
    expect(await prisma.template.count()).toBe(0)
  })

  it("is not public unless something else makes it so", async () => {
    const created = await templateRepository.create(tenant, aTemplate())

    expect(created.isPublic).toBe(false)
    expect(created.projectId).toBe(tenant.projectId)
  })
})

describe("deleting one", () => {
  it("takes it out of the listing without destroying it", async () => {
    // A template is somebody's work and the row carries the only copy.
    const created = await templateRepository.create(tenant, aTemplate())

    expect(await templateRepository.softDelete(tenant, created.id)).toBe(true)
    expect(await prisma.template.count()).toBe(1)
    expect((await prisma.template.findFirstOrThrow()).deletedAt).not.toBeNull()
  })

  it("refuses a public one, which is visible and not yours", async () => {
    /*
     * Deleting through a listing everybody can see would be a surprise with
     * no undo.
     */
    const id = await aPublicTemplate("Starter")

    expect(await templateRepository.softDelete(tenant, id)).toBe(false)
    expect((await prisma.template.findFirstOrThrow()).deletedAt).toBeNull()
  })

  it("refuses somebody else's", async () => {
    const other = await createTenant()
    const theirs = { ...other, projectId: await aProject(other.userId) }
    const created = await templateRepository.create(theirs, aTemplate())

    expect(await templateRepository.softDelete(tenant, created.id)).toBe(false)
  })

  it("answers false for one already gone", async () => {
    const created = await templateRepository.create(tenant, aTemplate())

    await templateRepository.softDelete(tenant, created.id)

    expect(await templateRepository.softDelete(tenant, created.id)).toBe(false)
  })
})
