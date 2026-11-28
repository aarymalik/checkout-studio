import { beforeEach, describe, expect, it } from "vitest"
import { prisma, publishedRepository, type TenantContext } from "@checkout-studio/database"
import type { DocumentValidatorRegistration } from "@checkout-studio/plugin-sdk"
import { createDocument, deserialize, serialize } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { publishPage } from "../../src/services/publishing/publish"
import { rollbackPage } from "../../src/services/publishing/rollback"

/**
 * Putting an old version back in front of customers.
 *
 * "Rollback → previous content served, original revision intact." The
 * second half is the one worth guarding: going back must not destroy what
 * it went back from, or going back is not safe to offer.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

const NO_RULES: readonly DocumentValidatorRegistration[] = []

function aDocument(title: string): CheckoutSchema {
  const document = createDocument({
    projectId: tenant.projectId,
    pageId: "pag_x",
    themeId: "theme_default",
  })

  return { ...document, settings: { ...document.settings, seo: { title } } }
}

async function aPage(title: string): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId: tenant.projectId,
      title: "Checkout",
      slug: `checkout-${String(Date.now())}-${String(counter)}`,
      draftSchema: JSON.parse(serialize(aDocument(title))) as never,
    },
  })

  return page.id
}

async function setDraft(pageId: string, title: string): Promise<void> {
  await prisma.page.update({
    where: { id: pageId },
    data: { draftSchema: JSON.parse(serialize(aDocument(title))) as never },
  })
}

async function versionOf(pageId: string): Promise<number> {
  return (await prisma.page.findFirstOrThrow({ where: { id: pageId } })).draftVersion
}

/** What a customer would be served right now. */
async function liveTitle(pageId: string): Promise<string | undefined> {
  const live = await publishedRepository.findPublishedById(pageId)

  if (live === null) return undefined

  const read = deserialize(live.schema)

  return read.ok ? read.document.settings.seo?.title : undefined
}

async function publish(pageId: string): Promise<string> {
  const result = await publishPage(tenant, {
    pageId,
    validators: NO_RULES,
    rendererVersion: "0.1.0",
  })

  if (!result.ok) throw new Error("the fixture did not publish")

  return result.revisionId
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
      email: `rollback-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("rolling back", () => {
  it("serves the previous content again", async () => {
    const pageId = await aPage("First")
    const first = await publish(pageId)

    await setDraft(pageId, "Second")
    await publish(pageId)

    expect(await liveTitle(pageId)).toBe("Second")

    const result = await rollbackPage(tenant, {
      pageId,
      revisionId: first,
      baseVersion: await versionOf(pageId),
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })

    expect(result).toMatchObject({ ok: true, created: true })
    expect(await liveTitle(pageId)).toBe("First")
  })

  it("leaves the revision it came from intact", async () => {
    const pageId = await aPage("First")
    const first = await publish(pageId)

    await setDraft(pageId, "Second")
    const second = await publish(pageId)

    await rollbackPage(tenant, {
      pageId,
      revisionId: first,
      baseVersion: await versionOf(pageId),
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })

    /*
     * The version rolled back *from* is still there to roll forward to.
     * Nothing about going back is destructive, which is the only thing
     * that makes going back safe to offer.
     */
    const kept = await prisma.revision.findFirstOrThrow({ where: { id: second } })
    const read = deserialize(kept.schema)

    expect(read.ok && read.document.settings.seo?.title).toBe("Second")
  })

  it("writes a new revision rather than moving an old one", async () => {
    const pageId = await aPage("First")
    const first = await publish(pageId)

    await setDraft(pageId, "Second")
    await publish(pageId)

    const result = await rollbackPage(tenant, {
      pageId,
      revisionId: first,
      baseVersion: await versionOf(pageId),
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })

    expect(result).toMatchObject({ ok: true, revisionNumber: 3 })
    expect(await prisma.revision.count({ where: { pageId } })).toBe(3)

    if (!result.ok) return

    expect(result.revisionId).not.toBe(first)
  })

  it("can be rolled forward again, because nothing was lost", async () => {
    const pageId = await aPage("First")
    const first = await publish(pageId)

    await setDraft(pageId, "Second")
    const second = await publish(pageId)

    await rollbackPage(tenant, {
      pageId,
      revisionId: first,
      baseVersion: await versionOf(pageId),
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })
    await rollbackPage(tenant, {
      pageId,
      revisionId: second,
      baseVersion: await versionOf(pageId),
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })

    expect(await liveTitle(pageId)).toBe("Second")
  })

  it("does nothing when the page is already serving that version", async () => {
    const pageId = await aPage("Only")
    const only = await publish(pageId)

    const result = await rollbackPage(tenant, {
      pageId,
      revisionId: only,
      baseVersion: await versionOf(pageId),
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })

    /*
     * The restored draft hashes to what is live, so the publish recognises
     * it and writes nothing. A merchant who pressed the wrong row has not
     * filled their history with a duplicate.
     */
    expect(result).toMatchObject({ ok: true, created: false, revisionId: only })
    expect(await prisma.revision.count({ where: { pageId } })).toBe(1)
  })
})

describe("a rollback that cannot go live", () => {
  const blocker: DocumentValidatorRegistration = {
    rule: "test.blocker",
    label: "blocker",
    validate: () => [
      { rule: "test.blocker", severity: "error", message: "not today", nodeIds: [] },
    ],
  }

  it("is blocked by today's rules, not by yesterday's", async () => {
    const pageId = await aPage("First")
    const first = await publish(pageId)

    await setDraft(pageId, "Second")
    await publish(pageId)

    /*
     * Publishable when it was written and refused now — a rule added
     * since, or an asset deleted since. The question is whether this
     * content can go live today.
     */
    const result = await rollbackPage(tenant, {
      pageId,
      revisionId: first,
      baseVersion: await versionOf(pageId),
      validators: [blocker],
      rendererVersion: "0.1.0",
    })

    expect(result).toMatchObject({ ok: false, reason: "blocked" })
    // Still serving what it was serving.
    expect(await liveTitle(pageId)).toBe("Second")
  })

  it("leaves the content in the draft to be fixed", async () => {
    const pageId = await aPage("First")
    const first = await publish(pageId)

    await setDraft(pageId, "Second")
    await publish(pageId)

    await rollbackPage(tenant, {
      pageId,
      revisionId: first,
      baseVersion: await versionOf(pageId),
      validators: [blocker],
      rendererVersion: "0.1.0",
    })

    /*
     * They asked for that version back and they have it, with the reason
     * it cannot go out. Refusing outright would leave them nothing to fix.
     */
    const page = await prisma.page.findFirstOrThrow({ where: { id: pageId } })
    const draft = deserialize(page.draftSchema)

    expect(draft.ok && draft.document.settings.seo?.title).toBe("First")
  })
})

describe("a rollback that does not start", () => {
  it("refuses a revision belonging to another page", async () => {
    const mine = await aPage("Mine")

    await publish(mine)

    const other = await aPage("Other")
    const theirs = await publish(other)

    expect(
      await rollbackPage(tenant, {
        pageId: mine,
        revisionId: theirs,
        baseVersion: await versionOf(mine),
        validators: NO_RULES,
        rendererVersion: "0.1.0",
      }),
    ).toEqual({ ok: false, reason: "not-found" })
    expect(await liveTitle(mine)).toBe("Mine")
  })
})
