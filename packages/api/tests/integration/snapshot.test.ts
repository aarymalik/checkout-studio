import { beforeEach, describe, expect, it } from "vitest"
import { prisma, publishedRepository, type TenantContext } from "@checkout-studio/database"
import { createDocument, deserialize, serialize } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { publishPage } from "../../src/services/publishing/publish"
import { restoreRevision } from "../../src/services/publishing/restore"
import { snapshotPage } from "../../src/services/publishing/snapshot"

/**
 * A version a merchant made on purpose.
 *
 * The thing worth guarding is that taking one is safe: it must not reach
 * a customer, and it must not refuse work that is halfway done — which is
 * exactly when somebody wants a bookmark.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

function aDocument(title: string): CheckoutSchema {
  const document = createDocument({
    projectId: tenant.projectId,
    pageId: "pag_x",
    themeId: "theme_default",
  })

  return { ...document, settings: { ...document.settings, seo: { title } } }
}

async function aPage(draft: unknown): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId: tenant.projectId,
      title: "Checkout",
      slug: `checkout-${String(Date.now())}-${String(counter)}`,
      draftSchema: draft as never,
    },
  })

  return page.id
}

async function versionOf(pageId: string): Promise<number> {
  return (await prisma.page.findFirstOrThrow({ where: { id: pageId } })).draftVersion
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
      email: `snapshot-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("taking a snapshot", () => {
  it("keeps the draft under the name it was given", async () => {
    const pageId = await aPage(JSON.parse(serialize(aDocument("Work in progress"))))

    const result = await snapshotPage(tenant, {
      pageId,
      name: "  Before the rewrite  ",
      rendererVersion: "0.1.0",
    })

    expect(result).toMatchObject({ ok: true, revisionNumber: 1 })

    const revision = await prisma.revision.findFirstOrThrow({ where: { pageId } })

    // Trimmed, because a name with a stray space is the same bookmark.
    expect(revision.name).toBe("Before the rewrite")
    expect(revision.kind).toBe("manual")
  })

  it("shows nobody anything", async () => {
    const pageId = await aPage(JSON.parse(serialize(aDocument("Half done"))))

    await snapshotPage(tenant, { pageId, name: "Bookmark", rendererVersion: "0.1.0" })

    /*
     * A snapshot faces nobody. Taking one must not be a way to deploy by
     * accident.
     */
    expect(await publishedRepository.findPublishedById(pageId)).toBeNull()
    expect((await prisma.page.findFirstOrThrow({ where: { id: pageId } })).status).toBe("draft")
  })

  it("does not refuse work that could not go live", async () => {
    const pageId = await aPage(JSON.parse(serialize(aDocument("Mid-change"))))

    /*
     * No validators are consulted at all. Refusing to let somebody
     * bookmark work in progress because the work is in progress would
     * make this useless exactly when it is most wanted — before a large
     * change, when a page is least likely to be publishable.
     */
    expect(
      await snapshotPage(tenant, { pageId, name: "Mid", rendererVersion: "0.1.0" }),
    ).toMatchObject({ ok: true })
  })

  it("can be restored like any other revision", async () => {
    const pageId = await aPage(JSON.parse(serialize(aDocument("Kept"))))
    const taken = await snapshotPage(tenant, {
      pageId,
      name: "Kept",
      rendererVersion: "0.1.0",
    })

    if (!taken.ok) throw new Error("the fixture did not snapshot")

    await prisma.page.update({
      where: { id: pageId },
      data: { draftSchema: JSON.parse(serialize(aDocument("Changed"))) as never },
    })

    // Restoring takes any revision of the page, so this works without
    // either side learning what a snapshot is.
    const restored = await restoreRevision(tenant, {
      pageId,
      revisionId: taken.revisionId,
      baseVersion: await versionOf(pageId),
    })

    expect(restored).toMatchObject({ ok: true })

    const page = await prisma.page.findFirstOrThrow({ where: { id: pageId } })
    const draft = deserialize(page.draftSchema)

    expect(draft.ok && draft.document.settings.seo?.title).toBe("Kept")
  })

  it("keeps two of identical content, because the names differ", async () => {
    const pageId = await aPage(JSON.parse(serialize(aDocument("Same"))))

    await snapshotPage(tenant, { pageId, name: "Known good", rendererVersion: "0.1.0" })
    await snapshotPage(tenant, { pageId, name: "Before the rewrite", rendererVersion: "0.1.0" })

    /*
     * Publishing the same thing twice writes one revision. A name is not
     * a timestamp: these can mean different things about identical
     * content, and which one is wanted back is the merchant's to say.
     */
    expect(await prisma.revision.count({ where: { pageId } })).toBe(2)
  })

  it("records the hash, so a history panel can say two entries match", async () => {
    const pageId = await aPage(JSON.parse(serialize(aDocument("Same"))))

    await snapshotPage(tenant, { pageId, name: "One", rendererVersion: "0.1.0" })
    await snapshotPage(tenant, { pageId, name: "Two", rendererVersion: "0.1.0" })

    const [first, second] = await prisma.revision.findMany({
      where: { pageId },
      orderBy: { number: "asc" },
    })

    expect(first?.contentHash).not.toBeNull()
    expect(first?.contentHash).toBe(second?.contentHash)
  })

  it("hashes the same as publishing the same draft", async () => {
    const pageId = await aPage(JSON.parse(serialize(aDocument("Same"))))

    await snapshotPage(tenant, { pageId, name: "Bookmark", rendererVersion: "0.1.0" })
    await publishPage(tenant, { pageId, validators: [], rendererVersion: "0.1.0" })

    /*
     * One answer to "is this the same version", shared by both paths. Two
     * would be two answers, and the one that fell behind would be the one
     * nobody noticed.
     */
    const revisions = await prisma.revision.findMany({ where: { pageId } })

    expect(revisions).toHaveLength(2)
    expect(revisions[0]?.contentHash).toBe(revisions[1]?.contentHash)
  })
})

describe("a snapshot that is not taken", () => {
  it("refuses a name that is only spaces", async () => {
    const pageId = await aPage(JSON.parse(serialize(aDocument("Draft"))))

    // A snapshot with no name is one nobody will recognise later.
    expect(await snapshotPage(tenant, { pageId, name: "   ", rendererVersion: "0.1.0" })).toEqual({
      ok: false,
      reason: "unnamed",
    })
    expect(await prisma.revision.count()).toBe(0)
  })

  it("refuses a draft that cannot be read", async () => {
    const pageId = await aPage({ not: "a document" })

    // A revision nobody can read is not a place anybody can return to.
    expect(
      await snapshotPage(tenant, { pageId, name: "Doomed", rendererVersion: "0.1.0" }),
    ).toEqual({ ok: false, reason: "unreadable" })
    expect(await prisma.revision.count()).toBe(0)
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
      },
    })

    expect(
      await snapshotPage(tenant, { pageId: theirPage.id, name: "Mine", rendererVersion: "0.1.0" }),
    ).toEqual({ ok: false, reason: "not-found" })
    expect(await prisma.revision.count()).toBe(0)
  })
})
