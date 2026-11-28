import { beforeEach, describe, expect, it } from "vitest"
import {
  DraftConflictError,
  prisma,
  publishedRepository,
  type TenantContext,
} from "@checkout-studio/database"
import { createDocument, deserialize, serialize } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { publishPage } from "../../src/services/publishing/publish"
import { restoreRevision } from "../../src/services/publishing/restore"

/**
 * Putting an old revision back into the editor.
 *
 * The clone half of "rollback clones, never overwrites". What matters is
 * that history does not move and the world is not told anything: a
 * merchant looking at an old version should be able to change their mind
 * and leave without having shown it to a customer.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

function aDocument(title?: string): CheckoutSchema {
  const document = createDocument({
    projectId: tenant.projectId,
    pageId: "pag_x",
    themeId: "theme_default",
  })

  return title === undefined
    ? document
    : { ...document, settings: { ...document.settings, seo: { title } } }
}

async function aPage(document: CheckoutSchema): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId: tenant.projectId,
      title: "Checkout",
      slug: `checkout-${String(Date.now())}-${String(counter)}`,
      draftSchema: JSON.parse(serialize(document)) as never,
    },
  })

  return page.id
}

async function setDraft(pageId: string, document: CheckoutSchema): Promise<void> {
  await prisma.page.update({
    where: { id: pageId },
    data: { draftSchema: JSON.parse(serialize(document)) as never },
  })
}

/** The page's draft, as a document. */
async function draftOf(pageId: string): Promise<CheckoutSchema> {
  const page = await prisma.page.findFirstOrThrow({ where: { id: pageId } })
  const read = deserialize(page.draftSchema)

  if (!read.ok) throw new Error("the draft cannot be read")

  return read.document
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
      email: `restore-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("restoring a revision", () => {
  it("puts its content in the draft", async () => {
    const pageId = await aPage(aDocument("First"))
    const published = await publishPage(tenant, {
      pageId,
      validators: [],
      rendererVersion: "0.1.0",
    })

    if (!published.ok) throw new Error("the fixture did not publish")

    await setDraft(pageId, aDocument("Second"))

    const result = await restoreRevision(tenant, {
      pageId,
      revisionId: published.revisionId,
      baseVersion: await versionOf(pageId),
    })

    expect(result).toMatchObject({ ok: true })
    expect((await draftOf(pageId)).settings.seo?.title).toBe("First")
  })

  it("leaves every revision where it was", async () => {
    const pageId = await aPage(aDocument("First"))
    const published = await publishPage(tenant, {
      pageId,
      validators: [],
      rendererVersion: "0.1.0",
    })

    if (!published.ok) throw new Error("the fixture did not publish")

    await setDraft(pageId, aDocument("Second"))
    await restoreRevision(tenant, {
      pageId,
      revisionId: published.revisionId,
      baseVersion: await versionOf(pageId),
    })

    // Clones, never overwrites. The thing restored from is still there to
    // go back to.
    expect(await prisma.revision.count({ where: { pageId } })).toBe(1)

    const revision = await prisma.revision.findFirstOrThrow({ where: { pageId } })
    const stored = deserialize(revision.schema)

    expect(stored.ok).toBe(true)
    expect(stored.ok && stored.document.settings.seo?.title).toBe("First")
  })

  it("tells nobody: the page still serves what it served", async () => {
    const pageId = await aPage(aDocument("Live"))
    const published = await publishPage(tenant, {
      pageId,
      validators: [],
      rendererVersion: "0.1.0",
    })

    if (!published.ok) throw new Error("the fixture did not publish")

    await setDraft(pageId, aDocument("Draft"))
    await restoreRevision(tenant, {
      pageId,
      revisionId: published.revisionId,
      baseVersion: await versionOf(pageId),
    })

    /*
     * Restoring is not a deployment. A merchant should be able to look at
     * an old version, change their mind, and leave without a customer
     * having seen it.
     */
    const live = await publishedRepository.findPublishedById(pageId)

    expect(live?.revisionId).toBe(published.revisionId)
  })

  it("moves the draft version on, like any other save", async () => {
    const pageId = await aPage(aDocument("First"))
    const published = await publishPage(tenant, {
      pageId,
      validators: [],
      rendererVersion: "0.1.0",
    })

    if (!published.ok) throw new Error("the fixture did not publish")

    const before = await versionOf(pageId)
    const result = await restoreRevision(tenant, {
      pageId,
      revisionId: published.revisionId,
      baseVersion: before,
    })

    expect(result).toEqual({ ok: true, draftVersion: before + 1 })
  })
})

describe("a restore that does not happen", () => {
  it("collides with somebody else's editing", async () => {
    const pageId = await aPage(aDocument("First"))
    const published = await publishPage(tenant, {
      pageId,
      validators: [],
      rendererVersion: "0.1.0",
    })

    if (!published.ok) throw new Error("the fixture did not publish")

    const stale = await versionOf(pageId)

    await setDraft(pageId, aDocument("Theirs"))
    await prisma.page.update({
      where: { id: pageId },
      data: { draftVersion: { increment: 1 } },
    })

    /*
     * The same conflict any other save raises. Restoring is a large change
     * to a document and the worst one to lose silently.
     */
    await expect(
      restoreRevision(tenant, { pageId, revisionId: published.revisionId, baseVersion: stale }),
    ).rejects.toBeInstanceOf(DraftConflictError)
  })

  it("refuses a revision belonging to another page", async () => {
    const mine = await aPage(aDocument("Mine"))
    const other = await aPage(aDocument("Other"))
    const published = await publishPage(tenant, {
      pageId: other,
      validators: [],
      rendererVersion: "0.1.0",
    })

    if (!published.ok) throw new Error("the fixture did not publish")

    /*
     * Both pages are this caller's, so ownership alone would let this
     * through — and it would write the other page's content into this one,
     * which is what a copied URL does by accident.
     */
    expect(
      await restoreRevision(tenant, {
        pageId: mine,
        revisionId: published.revisionId,
        baseVersion: await versionOf(mine),
      }),
    ).toEqual({ ok: false, reason: "not-found" })
    expect((await draftOf(mine)).settings.seo?.title).toBe("Mine")
  })

  it("refuses a revision this caller does not own", async () => {
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
    const theirRevision = await prisma.revision.create({
      data: {
        pageId: theirPage.id,
        number: 1,
        kind: "publish",
        schema: JSON.parse(serialize(aDocument("Theirs"))) as never,
        theme: {} as never,
        schemaVersion: "1.0.0",
        rendererVersion: "0.1.0",
        createdBy: stranger.id,
      },
    })

    expect(
      await restoreRevision(tenant, {
        pageId: theirPage.id,
        revisionId: theirRevision.id,
        baseVersion: 0,
      }),
    ).toEqual({ ok: false, reason: "not-found" })
  })

  it("refuses a revision this release cannot read", async () => {
    const pageId = await aPage(aDocument("First"))
    const unreadable = await prisma.revision.create({
      data: {
        pageId,
        number: 1,
        kind: "publish",
        schema: { not: "a document" } as never,
        theme: {} as never,
        schemaVersion: "1.0.0",
        rendererVersion: "0.1.0",
        createdBy: tenant.userId,
      },
    })

    /*
     * Reported here rather than in the editor, which would otherwise open
     * on something it cannot parse.
     */
    expect(
      await restoreRevision(tenant, {
        pageId,
        revisionId: unreadable.id,
        baseVersion: await versionOf(pageId),
      }),
    ).toEqual({ ok: false, reason: "unreadable" })
    expect((await draftOf(pageId)).settings.seo?.title).toBe("First")
  })
})
