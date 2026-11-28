import { beforeEach, describe, expect, it } from "vitest"
import { prisma, type TenantContext } from "@checkout-studio/database"

import {
  issuePreview,
  listPreviews,
  redeemPreview,
  revokePreview,
} from "../../src/services/publishing/preview"

/**
 * Showing a draft to somebody who cannot sign in.
 *
 * The required cases are valid, expired, tampered and wrong page. Three of
 * those are the same answer — null — and the file is mostly about making
 * sure they stay that way, because a link that fails differently depending
 * on why is a link that tells a guesser how close they are.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

async function aPage(): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId: tenant.projectId,
      title: "Checkout",
      slug: `checkout-${String(Date.now())}-${String(counter)}`,
      draftSchema: {},
    },
  })

  return page.id
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.previewToken.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `preview-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("a link that works", () => {
  it("opens the page it was made for", async () => {
    const pageId = await aPage()
    const issued = await issuePreview(tenant, { pageId })

    expect(issued).toMatchObject({ ok: true })

    if (!issued.ok) return

    expect(await redeemPreview(issued.preview.token)).toBe(pageId)
  })

  it("expires when it says it will", async () => {
    const pageId = await aPage()
    const now = new Date("2026-01-01T00:00:00.000Z")
    const issued = await issuePreview(tenant, { pageId, hours: 1, now })

    if (!issued.ok) return

    const justBefore = new Date(now.getTime() + 59 * 60 * 1000)
    const justAfter = new Date(now.getTime() + 61 * 60 * 1000)

    expect(await redeemPreview(issued.preview.token, justBefore)).toBe(pageId)
    expect(await redeemPreview(issued.preview.token, justAfter)).toBeNull()
  })

  it("lasts three days unless told otherwise", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z")
    const issued = await issuePreview(tenant, { pageId: await aPage(), now })

    if (!issued.ok) return

    expect(issued.preview.expiresAt.toISOString()).toBe("2026-01-04T00:00:00.000Z")
  })

  it("will not be talked into lasting a year", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z")
    const issued = await issuePreview(tenant, { pageId: await aPage(), hours: 24 * 365, now })

    if (!issued.ok) return

    // Capped at thirty days: beyond that somebody should make a new link
    // rather than a longer one.
    expect(issued.preview.expiresAt.toISOString()).toBe("2026-01-31T00:00:00.000Z")
  })
})

describe("the secret", () => {
  it("is never stored", async () => {
    const issued = await issuePreview(tenant, { pageId: await aPage() })

    if (!issued.ok) return

    const row = await prisma.previewToken.findFirstOrThrow({})

    /*
     * A leaked table yields no working link, the same way it yields no
     * working session cookie.
     */
    expect(row.tokenHash).not.toBe(issued.preview.token)
    expect(row.tokenHash).toHaveLength(64)
  })

  it("is different every time", async () => {
    const pageId = await aPage()
    const first = await issuePreview(tenant, { pageId })
    const second = await issuePreview(tenant, { pageId })

    if (!first.ok || !second.ok) return

    expect(first.preview.token).not.toBe(second.preview.token)
  })
})

describe("a link that does not work", () => {
  it("is nothing when a character was changed", async () => {
    const issued = await issuePreview(tenant, { pageId: await aPage() })

    if (!issued.ok) return

    const tampered = `${issued.preview.token.slice(0, -1)}${
      issued.preview.token.endsWith("A") ? "B" : "A"
    }`

    /*
     * No special handling anywhere: a changed character hashes to
     * something nobody issued, so a forged token is indistinguishable
     * from a wrong one.
     */
    expect(await redeemPreview(tampered)).toBeNull()
  })

  it("is nothing for a token nobody issued", async () => {
    expect(await redeemPreview("not-a-real-token")).toBeNull()
    expect(await redeemPreview("")).toBeNull()
  })

  it("is nothing once it is revoked", async () => {
    const pageId = await aPage()
    const issued = await issuePreview(tenant, { pageId })

    if (!issued.ok) return

    expect(await revokePreview(tenant, issued.preview.id)).toEqual({ ok: true, changed: true })
    expect(await redeemPreview(issued.preview.token)).toBeNull()
  })

  it("is nothing once the page is deleted", async () => {
    const pageId = await aPage()
    const issued = await issuePreview(tenant, { pageId })

    if (!issued.ok) return

    await prisma.page.update({ where: { id: pageId }, data: { deletedAt: new Date() } })

    expect(await redeemPreview(issued.preview.token)).toBeNull()
  })

  it("opens its own page and no other", async () => {
    const mine = await aPage()
    const other = await aPage()
    const issued = await issuePreview(tenant, { pageId: mine })

    if (!issued.ok) return

    // The token names its page, so there is no way to point one at
    // another — which is what the "wrong page" case comes down to.
    expect(await redeemPreview(issued.preview.token)).toBe(mine)
    expect(await redeemPreview(issued.preview.token)).not.toBe(other)
  })
})

describe("managing links", () => {
  it("lists them newest first, dead ones included", async () => {
    const pageId = await aPage()
    const first = await issuePreview(tenant, { pageId })

    if (!first.ok) return

    await issuePreview(tenant, { pageId })
    await revokePreview(tenant, first.preview.id)

    const links = await listPreviews(tenant, pageId)

    /*
     * A revoked link is still worth showing: somebody checking whether
     * they turned one off needs to see that they did.
     */
    expect(links).toHaveLength(2)
    expect(links.filter((link) => link.revokedAt !== null)).toHaveLength(1)
  })

  it("says nothing moved when a link was already revoked", async () => {
    const issued = await issuePreview(tenant, { pageId: await aPage() })

    if (!issued.ok) return

    /*
     * Revoking one that is already revoked is success with nothing
     * changed, the same shape unpublishing uses: the caller asked for
     * that link not to work, and it does not.
     */
    expect(await revokePreview(tenant, issued.preview.id)).toEqual({ ok: true, changed: true })
    expect(await revokePreview(tenant, issued.preview.id)).toEqual({ ok: true, changed: false })
  })

  it("refuses to issue for a page somebody else owns", async () => {
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

    expect(await issuePreview(tenant, { pageId: theirPage.id })).toEqual({
      ok: false,
      reason: "not-found",
    })
    expect(await prisma.previewToken.count()).toBe(0)
  })

  it("will not revoke somebody else's link", async () => {
    const stranger = await prisma.user.create({
      data: {
        email: `other2-${String(Date.now())}@example.test`,
        passwordHash: "fixture:no-password",
        emailVerifiedAt: new Date(),
      },
    })
    const theirProject = await prisma.project.create({
      data: { userId: stranger.id, name: "Theirs", slug: `theirs2-${String(Date.now())}` },
    })
    const theirPage = await prisma.page.create({
      data: {
        projectId: theirProject.id,
        title: "Theirs",
        slug: `theirs2-${String(Date.now())}`,
        draftSchema: {},
      },
    })
    const theirs = await issuePreview(
      { userId: stranger.id, projectId: theirProject.id },
      { pageId: theirPage.id },
    )

    if (!theirs.ok) return

    // Not-found rather than unchanged: somebody else's link is not a
    // link this caller has in any state.
    expect(await revokePreview(tenant, theirs.preview.id)).toEqual({
      ok: false,
      reason: "not-found",
    })
    // Still works, which is the part that matters.
    expect(await redeemPreview(theirs.preview.token)).toBe(theirPage.id)
  })
})
