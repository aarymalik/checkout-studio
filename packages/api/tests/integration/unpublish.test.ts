import { beforeEach, describe, expect, it } from "vitest"
import { prisma, publishedRepository, type TenantContext } from "@checkout-studio/database"
import { createDocument, serialize } from "@checkout-studio/schema"

import { publishPage } from "../../src/services/publishing/publish"
import { unpublishPage } from "../../src/services/publishing/unpublish"

/**
 * Taking a page off the web.
 *
 * Two things matter and they pull against each other: a visitor must stop
 * finding it, and nothing a merchant or a customer might later need may be
 * destroyed getting there.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

async function aPublishedPage(): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId: tenant.projectId,
      title: "Checkout",
      slug: `checkout-${String(Date.now())}-${String(counter)}`,
      draftSchema: JSON.parse(
        serialize(
          createDocument({
            projectId: tenant.projectId,
            pageId: "pag_x",
            themeId: "theme_default",
          }),
        ),
      ) as never,
    },
  })

  const published = await publishPage(tenant, {
    pageId: page.id,
    validators: [],
    rendererVersion: "0.1.0",
  })

  if (!published.ok) throw new Error("the fixture did not publish")

  return page.id
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.revision.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `unpublish-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("a page coming down", () => {
  it("stops being reachable", async () => {
    const pageId = await aPublishedPage()

    expect(await publishedRepository.findPublishedById(pageId)).not.toBeNull()
    expect(await unpublishPage(tenant, pageId)).toEqual({ ok: true, changed: true })

    // Through the read a visitor's request makes, not the row: that path
    // is where a 404 has to come from.
    expect(await publishedRepository.findPublishedById(pageId)).toBeNull()
  })

  it("is unpublished rather than back to a draft", async () => {
    const pageId = await aPublishedPage()

    await unpublishPage(tenant, pageId)

    /*
     * A page that was live and was taken down is not a page that was never
     * published, and the two answer differently to anyone reading a list.
     */
    expect((await prisma.page.findFirstOrThrow({ where: { id: pageId } })).status).toBe(
      "unpublished",
    )
  })

  it("keeps the revision it was serving", async () => {
    const pageId = await aPublishedPage()

    await unpublishPage(tenant, pageId)

    const page = await prisma.page.findFirstOrThrow({ where: { id: pageId } })

    // Nothing points at it any more, and it is still there: what somebody
    // bought was bought from that version of the page.
    expect(page.publishedRevisionId).toBeNull()
    expect(await prisma.revision.count({ where: { pageId } })).toBe(1)
    // Still the latest revision, which stays true of a page nobody can
    // reach.
    expect(page.currentRevisionId).not.toBeNull()
  })

  it("stops an embed of it being framable by anyone", async () => {
    const pageId = await aPublishedPage()

    await prisma.embedOrigin.create({
      data: { pageId, origin: "https://shop.example" },
    })

    expect(await publishedRepository.framingOrigins(pageId)).toEqual(["https://shop.example"])

    await unpublishPage(tenant, pageId)

    /*
     * An empty list becomes `frame-ancestors 'none'`, so the embed refuses
     * to load anywhere — without this path having to know an embed exists.
     */
    expect(await publishedRepository.framingOrigins(pageId)).toEqual([])
  })

  it("keeps the domains registered for when it comes back", async () => {
    const pageId = await aPublishedPage()

    await prisma.embedOrigin.create({ data: { pageId, origin: "https://shop.example" } })
    await unpublishPage(tenant, pageId)

    // Taking a checkout down is not a statement about which sites may show
    // it when it returns.
    expect(await prisma.embedOrigin.count({ where: { pageId } })).toBe(1)
  })

  it("can be published again", async () => {
    const pageId = await aPublishedPage()

    await unpublishPage(tenant, pageId)

    const again = await publishPage(tenant, {
      pageId,
      validators: [],
      rendererVersion: "0.1.0",
    })

    expect(again).toMatchObject({ ok: true })
    expect(await publishedRepository.findPublishedById(pageId)).not.toBeNull()
  })
})

describe("a page that is not coming down", () => {
  it("says nothing changed when it was already down", async () => {
    const pageId = await aPublishedPage()

    await unpublishPage(tenant, pageId)

    // Not a failure: taking down something already down is what the caller
    // asked for.
    expect(await unpublishPage(tenant, pageId)).toEqual({ ok: true, changed: false })
  })

  it("says nothing changed for a page that was never published", async () => {
    counter += 1

    const page = await prisma.page.create({
      data: {
        projectId: tenant.projectId,
        title: "Draft",
        slug: `draft-${String(Date.now())}-${String(counter)}`,
        draftSchema: {},
      },
    })

    expect(await unpublishPage(tenant, page.id)).toEqual({ ok: true, changed: false })
    expect((await prisma.page.findFirstOrThrow({ where: { id: page.id } })).status).toBe("draft")
  })

  it("is nothing for a page somebody else owns", async () => {
    const stranger = await prisma.user.create({
      data: {
        email: `other-${String(Date.now())}@example.test`,
        passwordHash: "fixture:no-password",
        emailVerifiedAt: new Date(),
      },
    })
    const theirProject = await prisma.project.create({
      data: { userId: stranger.id, name: "Theirs", slug: `theirs-${String(Date.now())}` },
    })
    const theirPage = await prisma.page.create({
      data: {
        projectId: theirProject.id,
        title: "Theirs",
        slug: `theirs-${String(Date.now())}`,
        draftSchema: {},
        status: "published",
      },
    })

    expect(await unpublishPage(tenant, theirPage.id)).toEqual({ ok: false, reason: "not-found" })
    // Untouched, which is the part that matters.
    expect((await prisma.page.findFirstOrThrow({ where: { id: theirPage.id } })).status).toBe(
      "published",
    )
  })
})
