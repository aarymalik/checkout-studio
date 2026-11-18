import { beforeEach, describe, expect, it } from "vitest"
import { prisma, templateRepository, type TenantContext } from "@checkout-studio/database"

import { listTemplates } from "../../src/services/templates/library"

/**
 * The library, as a panel asks for it.
 *
 * The repository's own rules are proved where it lives. What is proved here
 * is the shape of one request: that a panel opening gets everything it
 * needs, and that the filter it offers cannot trap anybody in it.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

async function aTemplate(name: string, category: string): Promise<void> {
  counter += 1

  await templateRepository.create(tenant, {
    name,
    slug: `${name.toLowerCase()}-${String(counter)}`,
    category,
    tags: [],
    schema: {},
    theme: {},
  })
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.template.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `library-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("what a panel gets when it opens", () => {
  it("is the templates and the categories, in one request", async () => {
    // Fetching them in sequence is a waterfall nobody sees a reason for.
    await aTemplate("Spring", "checkout")
    await aTemplate("Upsell", "upsell")

    const library = await listTemplates(tenant)

    expect(library.templates).toHaveLength(2)
    expect(library.categories).toEqual(["checkout", "upsell"])
  })

  it("is empty both ways for a project with nothing", async () => {
    expect(await listTemplates(tenant)).toEqual({ templates: [], categories: [] })
  })
})

describe("the categories under a filter", () => {
  it("are of everything visible, not of what is left", async () => {
    /*
     * The one that matters. A filter that narrowed its own options would
     * leave somebody who picked "upsell" with no way back to "checkout" —
     * a filter that has trapped them.
     */
    await aTemplate("Spring", "checkout")
    await aTemplate("Upsell", "upsell")

    const library = await listTemplates(tenant, { category: "upsell" })

    expect(library.templates.map((row) => row.name)).toEqual(["Upsell"])
    expect(library.categories).toEqual(["checkout", "upsell"])
  })

  it("are unchanged by a search that matches nothing", async () => {
    await aTemplate("Spring", "checkout")

    const library = await listTemplates(tenant, { search: "nothing like this" })

    expect(library.templates).toEqual([])
    expect(library.categories).toEqual(["checkout"])
  })
})
