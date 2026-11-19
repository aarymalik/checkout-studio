import { beforeEach, describe, expect, it } from "vitest"
import { prisma, templateRepository, type TenantContext } from "@checkout-studio/database"
import { createDocument, parseDocument, validateReferences } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { installTemplate } from "../../src/services/templates/install"

/**
 * Installing a template as a new page.
 *
 * "Templates are never edited directly", so the thing worth proving is that
 * what lands is a page of somebody's own: it belongs to their project, it
 * opens, and nothing they do to it reaches back.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

function aDocument(projectId: string): CheckoutSchema {
  return createDocument({ projectId, pageId: "pag_elsewhere", themeId: "theme_theirs" })
}

async function aTemplate(name: string, schema: unknown): Promise<string> {
  counter += 1

  const created = await templateRepository.create(tenant, {
    name,
    slug: `tpl-${String(counter)}`,
    category: "checkout",
    tags: [],
    schema: schema as never,
    theme: { id: "theme_theirs" } as never,
  })

  return created.id
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.template.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `install-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("a template that installs", () => {
  it("becomes a page in this project", async () => {
    const id = await aTemplate("Spring sale", aDocument("prj_elsewhere"))
    const result = await installTemplate(tenant, id)

    expect(result).toMatchObject({ ok: true, title: "Spring sale" })

    const page = await prisma.page.findFirstOrThrow({ where: { projectId: tenant.projectId } })

    expect(page.title).toBe("Spring sale")
  })

  it("leaves the template exactly as it was", async () => {
    // "Templates are never edited directly." What somebody edits afterwards
    // is their page.
    const id = await aTemplate("Spring sale", aDocument("prj_elsewhere"))

    await installTemplate(tenant, id)

    const template = await prisma.template.findFirstOrThrow()

    expect((template.schema as unknown as CheckoutSchema).projectId).toBe("prj_elsewhere")
    expect(await prisma.template.count()).toBe(1)
  })

  it("rehomes the document to the page it is now", async () => {
    /*
     * The document names the page it belongs to. One still naming the
     * template's would be a page that cannot find itself.
     */
    const id = await aTemplate("Spring sale", aDocument("prj_elsewhere"))
    const result = await installTemplate(tenant, id)

    if (!result.ok) throw new Error("Expected it to install.")

    const page = await prisma.page.findFirstOrThrow({ where: { id: result.pageId } })
    const document = page.draftSchema as unknown as CheckoutSchema

    expect(document.projectId).toBe(tenant.projectId)
    expect(document.pageId).toBe(result.pageId)
  })

  it("lands as a page that opens", async () => {
    const id = await aTemplate("Spring sale", aDocument("prj_elsewhere"))
    const result = await installTemplate(tenant, id)

    if (!result.ok) throw new Error("Expected it to install.")

    const page = await prisma.page.findFirstOrThrow({ where: { id: result.pageId } })
    const parsed = parseDocument(page.draftSchema)

    expect(parsed.ok).toBe(true)
    expect(parsed.ok ? validateReferences(parsed.document) : [{}]).toEqual([])
  })

  it("gets an address of its own when the name is taken", async () => {
    const id = await aTemplate("Spring sale", aDocument("prj_elsewhere"))

    const first = await installTemplate(tenant, id)
    const second = await installTemplate(tenant, id)

    expect(first.ok && second.ok && first.slug !== second.slug).toBe(true)
    expect(await prisma.page.count()).toBe(2)
  })
})

describe("a template that cannot be installed", () => {
  it("is one that is not there", async () => {
    expect(await installTemplate(tenant, "tpl_nobody")).toEqual({ ok: false, reason: "not-found" })
  })

  it("is somebody else's, which answers the same way", async () => {
    const other = await prisma.user.create({
      data: {
        email: `other-${String(Date.now())}@example.test`,
        passwordHash: "fixture:no-password",
        emailVerifiedAt: new Date(),
      },
    })
    const theirProject = await prisma.project.create({
      data: { userId: other.id, name: "Theirs", slug: `theirs-${String(Date.now())}` },
    })
    const id = await (async () => {
      const row = await prisma.template.create({
        data: {
          projectId: theirProject.id,
          name: "Theirs",
          slug: `theirs-${String(Date.now())}`,
          category: "checkout",
          schema: aDocument(theirProject.id) as never,
          theme: {},
        },
        select: { id: true },
      })

      return row.id
    })()

    expect(await installTemplate(tenant, id)).toEqual({ ok: false, reason: "not-found" })
    expect(await prisma.page.count()).toBe(0)
  })

  it("is one holding something that is not a page", async () => {
    // A template row is a column of JSON, possibly written by an older
    // version of this product. Handing it to the editor unread would turn a
    // bad row into a page that will not open.
    const id = await aTemplate("Broken", { version: "1.0.0" })
    const result = await installTemplate(tenant, id)

    expect(result).toMatchObject({ ok: false, reason: "unreadable" })
    expect(await prisma.page.count()).toBe(0)
  })

  it("is one whose tree does not hold together", async () => {
    /*
     * `parseDocument` answers whether it is shaped like a document. A root
     * pointing at a node that is not there parses, and installs as a page
     * nobody can open — and the person installing it did nothing wrong.
     */
    const document = aDocument("prj_elsewhere")
    const root = document.nodes[document.root]

    if (root === undefined) throw new Error("The fixture has no root.")

    const dangling = {
      ...document,
      nodes: { [document.root]: { ...root, children: ["gone"] } },
    }
    const result = await installTemplate(tenant, await aTemplate("Dangling", dangling))

    expect(result).toMatchObject({ ok: false, reason: "unreadable" })
    expect(
      result.ok === false && result.reason === "unreadable" ? result.problems : [],
    ).not.toEqual([])
    expect(await prisma.page.count()).toBe(0)
  })
})

describe("a public template", () => {
  it("installs for anybody who can see it", async () => {
    counter += 1

    const row = await prisma.template.create({
      data: {
        name: "Starter",
        slug: `starter-${String(counter)}`,
        category: "starter",
        schema: aDocument("prj_nobody") as never,
        theme: {},
        isPublic: true,
      },
      select: { id: true },
    })

    const result = await installTemplate(tenant, row.id)

    expect(result).toMatchObject({ ok: true, title: "Starter" })
    expect(await prisma.page.count({ where: { projectId: tenant.projectId } })).toBe(1)
  })
})
