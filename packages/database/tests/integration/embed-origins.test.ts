import { beforeEach, describe, expect, it } from "vitest"

import { embedOriginRepository, publishedRepository, TenantScopeError } from "../../src"
import type { TenantContext } from "../../src"
import { createTenant, prisma, truncateAll } from "../helpers"

/**
 * What may frame one page's embedded checkout.
 *
 * The list is the whole control, so most of these are about the ways a row
 * could reach it that should not: somebody else's page, a deleted one, the
 * same origin twice, or one more than the ceiling allows.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let pageId: string
let counter = 0

async function aProject(userId: string): Promise<string> {
  counter += 1

  const project = await prisma.project.create({
    data: { userId, name: "Test", slug: `test-${String(Date.now())}-${String(counter)}` },
  })

  return project.id
}

async function aPage(projectId: string): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId,
      title: "Checkout",
      slug: `checkout-${String(Date.now())}-${String(counter)}`,
      draftSchema: {},
    },
  })

  return page.id
}

beforeEach(async () => {
  await truncateAll()

  const created = await createTenant()
  const projectId = await aProject(created.userId)

  tenant = { ...created, projectId }
  pageId = await aPage(projectId)
})

describe("registering an origin", () => {
  it("stores it, unverified, and hands it back", async () => {
    const result = await embedOriginRepository.add(tenant, pageId, "https://shop.example.com", 20)

    expect(result).toMatchObject({ ok: true })

    if (!result.ok) return

    expect(result.origin.origin).toBe("https://shop.example.com")
    /*
     * Not a parameter and not true. Verification is Stripe's payment method
     * domain check passing, which is observed rather than asserted by
     * whoever registered the domain.
     */
    expect(result.origin.verified).toBe(false)
  })

  it("refuses the same origin twice", async () => {
    await embedOriginRepository.add(tenant, pageId, "https://a.example", 20)

    expect(await embedOriginRepository.add(tenant, pageId, "https://a.example", 20)).toEqual({
      ok: false,
      reason: "duplicate",
    })
    expect(await prisma.embedOrigin.count()).toBe(1)
  })

  it("lets two pages register the same origin, since the lists are separate", async () => {
    const other = await aPage(tenant.projectId)

    await embedOriginRepository.add(tenant, pageId, "https://a.example", 20)

    expect(await embedOriginRepository.add(tenant, other, "https://a.example", 20)).toMatchObject({
      ok: true,
    })
  })

  it("refuses one past the ceiling, and the ceiling is the list's not the row's", async () => {
    for (let index = 0; index < 3; index += 1) {
      const result = await embedOriginRepository.add(
        tenant,
        pageId,
        `https://${String(index)}.example`,
        3,
      )

      expect(result.ok).toBe(true)
    }

    expect(await embedOriginRepository.add(tenant, pageId, "https://last.example", 3)).toEqual({
      ok: false,
      reason: "at-capacity",
    })
    expect(await prisma.embedOrigin.count()).toBe(3)
  })

  it("counts only this page towards the ceiling", async () => {
    const other = await aPage(tenant.projectId)

    await embedOriginRepository.add(tenant, other, "https://theirs.example", 1)

    expect(
      await embedOriginRepository.add(tenant, pageId, "https://mine.example", 1),
    ).toMatchObject({ ok: true })
  })

  it("refuses a page in somebody else's project", async () => {
    const stranger = await createTenant()
    const theirProject = await aProject(stranger.userId)
    const theirPage = await aPage(theirProject)

    expect(
      await embedOriginRepository.add(
        { ...tenant, projectId: theirProject },
        theirPage,
        "https://a.example",
        20,
      ),
    ).toEqual({ ok: false, reason: "not-found" })
    expect(await prisma.embedOrigin.count()).toBe(0)
  })

  it("refuses a page that is deleted", async () => {
    await prisma.page.update({ where: { id: pageId }, data: { deletedAt: new Date() } })

    expect(await embedOriginRepository.add(tenant, pageId, "https://a.example", 20)).toEqual({
      ok: false,
      reason: "not-found",
    })
  })

  it("refuses to run at all without a project", async () => {
    await expect(
      embedOriginRepository.add({ userId: tenant.userId }, pageId, "https://a.example", 20),
    ).rejects.toBeInstanceOf(TenantScopeError)
  })
})

describe("the list for a page", () => {
  it("is in the order they were registered", async () => {
    /*
     * Asserted against insertion order rather than alphabetical, and the
     * fixture is deliberately not alphabetical: a list that happened to be
     * sorted would pass whether or not the ordering clause does anything.
     */
    for (const host of ["zeta", "alpha", "mid"]) {
      await embedOriginRepository.add(tenant, pageId, `https://${host}.example`, 20)
    }

    expect((await embedOriginRepository.list(tenant, pageId)).map((row) => row.origin)).toEqual([
      "https://zeta.example",
      "https://alpha.example",
      "https://mid.example",
    ])
  })

  it("holds nothing from another page", async () => {
    const other = await aPage(tenant.projectId)

    await embedOriginRepository.add(tenant, other, "https://theirs.example", 20)

    expect(await embedOriginRepository.list(tenant, pageId)).toEqual([])
  })

  it("is empty for somebody else's page rather than refused", async () => {
    const stranger = await createTenant()
    const theirProject = await aProject(stranger.userId)
    const theirPage = await aPage(theirProject)

    await embedOriginRepository.add(
      { ...stranger, projectId: theirProject },
      theirPage,
      "https://theirs.example",
      20,
    )

    expect(
      await embedOriginRepository.list({ ...tenant, projectId: theirProject }, theirPage),
    ).toEqual([])
  })
})

describe("removing an origin", () => {
  it("takes it off the list", async () => {
    const added = await embedOriginRepository.add(tenant, pageId, "https://a.example", 20)

    if (!added.ok) throw new Error("expected it to be added")

    expect(await embedOriginRepository.remove(tenant, pageId, added.origin.id)).toBe(true)
    expect(await embedOriginRepository.list(tenant, pageId)).toEqual([])
  })

  it("is false for a row that is not there", async () => {
    expect(await embedOriginRepository.remove(tenant, pageId, "eor_nothing")).toBe(false)
  })

  it("will not remove somebody else's", async () => {
    const stranger = await createTenant()
    const theirProject = await aProject(stranger.userId)
    const theirPage = await aPage(theirProject)
    const added = await embedOriginRepository.add(
      { ...stranger, projectId: theirProject },
      theirPage,
      "https://theirs.example",
      20,
    )

    if (!added.ok) throw new Error("expected it to be added")

    expect(
      await embedOriginRepository.remove(
        { ...tenant, projectId: theirProject },
        theirPage,
        added.origin.id,
      ),
    ).toBe(false)
    expect(await prisma.embedOrigin.count()).toBe(1)
  })

  it("will not remove a row belonging to a different page", async () => {
    const other = await aPage(tenant.projectId)
    const added = await embedOriginRepository.add(tenant, other, "https://a.example", 20)

    if (!added.ok) throw new Error("expected it to be added")

    // Same owner, same project, wrong page. The pageId in the URL has to
    // match the row, or a stale list could delete from the page beside it.
    expect(await embedOriginRepository.remove(tenant, pageId, added.origin.id)).toBe(false)
  })
})

describe("deleting the page", () => {
  it("takes its origins with it", async () => {
    await embedOriginRepository.add(tenant, pageId, "https://a.example", 20)

    await prisma.page.delete({ where: { id: pageId } })

    // Cascade, not cleanup. An origin outliving its page is a row granting
    // framing rights to nothing, and nothing would ever come to remove it.
    expect(await prisma.embedOrigin.count()).toBe(0)
  })
})

describe("the origins a visitor's browser is framed by", () => {
  /** What the renderer asks: unauthenticated, by page id, on a live request. */
  async function framing(id: string): Promise<readonly string[]> {
    return publishedRepository.framingOrigins(id)
  }

  async function publish(id: string): Promise<void> {
    await prisma.page.update({ where: { id }, data: { status: "published" } })
  }

  it("is what the merchant registered, once the page is published", async () => {
    await embedOriginRepository.add(tenant, pageId, "https://shop.example", 20)
    await embedOriginRepository.add(tenant, pageId, "https://www.shop.example", 20)
    await publish(pageId)

    expect([...(await framing(pageId))].sort()).toEqual([
      "https://shop.example",
      "https://www.shop.example",
    ])
  })

  it("includes one Stripe has not verified, because verification gates wallets", async () => {
    const added = await embedOriginRepository.add(tenant, pageId, "https://new.example", 20)

    if (!added.ok) throw new Error("expected it to be added")

    expect(added.origin.verified).toBe(false)

    await publish(pageId)

    // Framing is what the domain was registered for. Refusing it until a
    // file has been checked would break every card-only checkout.
    expect(await framing(pageId)).toEqual(["https://new.example"])
  })

  it("is empty while the page is still a draft", async () => {
    await embedOriginRepository.add(tenant, pageId, "https://shop.example", 20)

    // Registered, not published. Nothing may frame a page that is not live.
    expect(await framing(pageId)).toEqual([])
  })

  it("is empty once the page is deleted", async () => {
    await embedOriginRepository.add(tenant, pageId, "https://shop.example", 20)
    await publish(pageId)
    await prisma.page.update({ where: { id: pageId }, data: { deletedAt: new Date() } })

    expect(await framing(pageId)).toEqual([])
  })

  it("is empty once the project is deleted", async () => {
    await embedOriginRepository.add(tenant, pageId, "https://shop.example", 20)
    await publish(pageId)
    await prisma.project.update({
      where: { id: tenant.projectId },
      data: { deletedAt: new Date() },
    })

    expect(await framing(pageId)).toEqual([])
  })

  it("is empty for a page id that is not real", async () => {
    /*
     * The same answer as every other way this comes to nothing, so an
     * unauthenticated caller cannot learn which page ids exist. An empty
     * list becomes 'none', so the default for an unknown page is that
     * nothing may frame it.
     */
    expect(await framing("pg_nothing")).toEqual([])
  })

  it("holds nothing from another page", async () => {
    const other = await aPage(tenant.projectId)

    await embedOriginRepository.add(tenant, other, "https://theirs.example", 20)
    await embedOriginRepository.add(tenant, pageId, "https://mine.example", 20)
    await publish(pageId)
    await publish(other)

    expect(await framing(pageId)).toEqual(["https://mine.example"])
  })
})
