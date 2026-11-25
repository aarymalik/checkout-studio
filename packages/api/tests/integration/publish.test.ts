import { beforeEach, describe, expect, it } from "vitest"
import { prisma, publishedRepository, type TenantContext } from "@checkout-studio/database"
import type { DocumentValidatorRegistration } from "@checkout-studio/plugin-sdk"
import { createDocument, defaultTheme, serialize } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { publishPage } from "../../src/services/publishing/publish"

/**
 * Taking a page live.
 *
 * What matters is that the revision is a snapshot and not a reference:
 * editing a theme afterwards must not change what a customer is looking at.
 * That is the promise a merchant is making when they press this, and the
 * only thing that makes rolling back to an older revision mean anything.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

const NO_RULES: readonly DocumentValidatorRegistration[] = []

const blocker: DocumentValidatorRegistration = {
  rule: "test.blocker",
  label: "blocker",
  validate: () => [{ rule: "test.blocker", severity: "error", message: "not yet", nodeIds: [] }],
}

function aDocument(): CheckoutSchema {
  return createDocument({ projectId: tenant.projectId, pageId: "pag_x", themeId: "theme_default" })
}

async function aPage(document: CheckoutSchema = aDocument()): Promise<string> {
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

/**
 * A theme the project owns, so `resolveTheme` has something to resolve.
 *
 * Built from `defaultTheme` rather than hand-written: the resolver parses
 * each stored row and drops what does not validate, so a partial fixture
 * is silently ignored and the test then asserts against the default while
 * appearing to assert against itself.
 */
async function aTheme(primary: string): Promise<void> {
  await prisma.theme.create({
    data: {
      projectId: tenant.projectId,
      name: "Default",
      tokens: JSON.parse(
        JSON.stringify({
          ...defaultTheme,
          colors: { ...defaultTheme.colors, primary },
        }),
      ) as never,
    },
  })
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.revision.deleteMany({})
  await prisma.theme.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `publish-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("a page going live", () => {
  it("becomes published, pointing at the revision it made", async () => {
    const pageId = await aPage()
    const result = await publishPage(tenant, {
      pageId,
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })

    expect(result).toMatchObject({ ok: true, revisionNumber: 1 })

    if (!result.ok) return

    const page = await prisma.page.findFirstOrThrow({ where: { id: pageId } })

    expect(page.status).toBe("published")
    expect(page.publishedRevisionId).toBe(result.revisionId)
    // Also the current one: what was just published is what the editor is
    // sitting on, until somebody edits again.
    expect(page.currentRevisionId).toBe(result.revisionId)
  })

  it("is reachable by the renderer straight away", async () => {
    const pageId = await aPage()

    await publishPage(tenant, { pageId, validators: NO_RULES, rendererVersion: "0.1.0" })

    // Through the unauthenticated read a customer's request uses, not
    // through the row: that path has its own conditions and this is the
    // moment they are supposed to start being met.
    expect(await publishedRepository.findPublishedById(pageId)).not.toBeNull()
  })

  it("numbers revisions as they accumulate", async () => {
    const pageId = await aPage()

    await publishPage(tenant, { pageId, validators: NO_RULES, rendererVersion: "0.1.0" })
    const second = await publishPage(tenant, {
      pageId,
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })

    expect(second).toMatchObject({ ok: true, revisionNumber: 2 })
  })

  it("records the renderer it was built against", async () => {
    const pageId = await aPage()
    const result = await publishPage(tenant, {
      pageId,
      validators: NO_RULES,
      rendererVersion: "9.9.9",
    })

    expect(result.ok).toBe(true)

    const revision = await prisma.revision.findFirstOrThrow({ where: { pageId } })

    // Which build drew it, so a revision that stops rendering can be told
    // apart from a revision that was always wrong.
    expect(revision.rendererVersion).toBe("9.9.9")
    expect(revision.kind).toBe("publish")
  })

  it("brings warnings back with it", async () => {
    const noisy: DocumentValidatorRegistration = {
      rule: "test.noisy",
      label: "noisy",
      validate: () => [
        { rule: "test.noisy", severity: "warning", message: "worth a look", nodeIds: [] },
      ],
    }

    const result = await publishPage(tenant, {
      pageId: await aPage(),
      validators: [noisy],
      rendererVersion: "0.1.0",
    })

    expect(result).toMatchObject({ ok: true })

    if (!result.ok) return

    expect(result.warnings.map((issue) => issue.rule)).toEqual(["test.noisy"])
  })
})

describe("the snapshot", () => {
  it("holds the theme as it was, not as it becomes", async () => {
    await aTheme("#111111")

    const pageId = await aPage()
    const result = await publishPage(tenant, {
      pageId,
      validators: NO_RULES,
      rendererVersion: "0.1.0",
    })

    expect(result.ok).toBe(true)

    /*
     * The whole point. A merchant pressing publish is promised that what
     * they saw is what a customer gets until they say otherwise, and a
     * revision that referred to the theme would change under them the next
     * time somebody picked a colour.
     */
    await prisma.theme.updateMany({
      data: {
        tokens: {
          id: "theme_default",
          name: "Default",
          version: "1.0.0",
          colors: { primary: "#ff0000" },
        } as never,
      },
    })

    const published = await publishedRepository.findPublishedById(pageId)
    const theme = published?.theme as { colors?: { primary?: string } } | undefined

    expect(theme?.colors?.primary).toBe("#111111")
  })

  it("stores the document the editor was holding", async () => {
    const document = aDocument()
    const pageId = await aPage(document)

    await publishPage(tenant, { pageId, validators: NO_RULES, rendererVersion: "0.1.0" })

    const revision = await prisma.revision.findFirstOrThrow({ where: { pageId } })

    /*
     * Deep equality, not the canonical bytes. The document is written
     * through `serialize`, but the column is `jsonb` and Postgres does not
     * keep key order — so what comes back is the same document and not the
     * same string.
     *
     * Worth knowing beyond this test: a hash of a revision has to be taken
     * before it is stored, because it cannot be reproduced from the row.
     */
    expect(revision.schema).toEqual(JSON.parse(serialize(document)))
  })
})

describe("a page that cannot go live", () => {
  it("writes no revision when a rule blocks it", async () => {
    const pageId = await aPage()
    const result = await publishPage(tenant, {
      pageId,
      validators: [blocker],
      rendererVersion: "0.1.0",
    })

    expect(result).toMatchObject({ ok: false, reason: "blocked" })
    // Nothing half-done: no revision, and the page is still a draft.
    expect(await prisma.revision.count()).toBe(0)
    expect((await prisma.page.findFirstOrThrow({ where: { id: pageId } })).status).toBe("draft")
  })

  it("stays unreachable to the renderer", async () => {
    const pageId = await aPage()

    await publishPage(tenant, { pageId, validators: [blocker], rendererVersion: "0.1.0" })

    expect(await publishedRepository.findPublishedById(pageId)).toBeNull()
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
      await publishPage(tenant, {
        pageId: theirPage.id,
        validators: NO_RULES,
        rendererVersion: "0.1.0",
      }),
    ).toEqual({ ok: false, reason: "not-found" })
    expect(await prisma.revision.count()).toBe(0)
  })
})
