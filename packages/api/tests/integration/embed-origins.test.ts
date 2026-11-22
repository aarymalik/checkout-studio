import { beforeEach, describe, expect, it } from "vitest"
import { readEmbedOrigins, redis } from "@checkout-studio/cache"
import { prisma, type TenantContext } from "@checkout-studio/database"
import { MAX_EMBED_ORIGINS } from "@checkout-studio/utils"

import { listOrigins, registerOrigin, removeOrigin } from "../../src/services/embed/origins"

/**
 * Registering what may frame a page's embedded checkout.
 *
 * The repository is tested for the shape of the list and the primitives for
 * what an origin is. What is only true here is the join between them: which
 * refusal a merchant gets, and what they are offered next.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let pageId: string
let counter = 0

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
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.embedOrigin.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `embed-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
  pageId = await aPage(project.id)
})

describe("a domain a merchant registers", () => {
  it("is normalised on the way in", async () => {
    const result = await registerOrigin(tenant, pageId, "  Shop.Example.COM/  ")

    expect(result).toMatchObject({ ok: true })

    if (!result.ok) return

    // What reaches the header is what a browser sends, not what was typed.
    expect(result.origin.origin).toBe("https://shop.example.com")
  })

  it("comes back with the other spelling to offer", async () => {
    const result = await registerOrigin(tenant, pageId, "example.com")

    expect(result).toMatchObject({ ok: true, companion: "https://www.example.com" })
  })

  it("does not add the other spelling itself", async () => {
    await registerOrigin(tenant, pageId, "example.com")

    /*
     * A suggestion, not a second row. Adding an origin nobody typed to the
     * list that decides who may frame a payment page is not ours to do.
     */
    expect((await listOrigins(tenant, pageId)).map((row) => row.origin)).toEqual([
      "https://example.com",
    ])
  })

  it("stops offering the counterpart once it is registered too", async () => {
    await registerOrigin(tenant, pageId, "www.example.com")

    expect(await registerOrigin(tenant, pageId, "example.com")).toMatchObject({
      ok: true,
      companion: null,
    })
  })

  it("offers nothing for a subdomain, which has no counterpart", async () => {
    expect(await registerOrigin(tenant, pageId, "shop.example.com")).toMatchObject({
      ok: true,
      companion: null,
    })
  })
})

describe("a domain that is refused", () => {
  it("is refused with a sentence, not a code, when it is not an origin", async () => {
    const result = await registerOrigin(tenant, pageId, "https://*.example.com")

    expect(result).toMatchObject({ ok: false, reason: "invalid" })

    if (result.ok || result.reason !== "invalid") return

    expect(result.message).toBe("Wildcards are not accepted. Add each subdomain you use.")
    expect(await prisma.embedOrigin.count()).toBe(0)
  })

  it("refuses http, since a live embed is the only kind there is", async () => {
    // The development mode exists in the parser and nothing asks for it yet.
    expect(await registerOrigin(tenant, pageId, "http://localhost:3000")).toMatchObject({
      ok: false,
      reason: "invalid",
    })
  })

  it("says so plainly when it is already there", async () => {
    await registerOrigin(tenant, pageId, "example.com")

    expect(await registerOrigin(tenant, pageId, "https://example.com")).toEqual({
      ok: false,
      reason: "duplicate",
    })
  })

  it("names the ceiling when the list is full", async () => {
    for (let index = 0; index < MAX_EMBED_ORIGINS; index += 1) {
      const result = await registerOrigin(tenant, pageId, `https://${String(index)}.example`)

      expect(result.ok).toBe(true)
    }

    expect(await registerOrigin(tenant, pageId, "https://last.example")).toEqual({
      ok: false,
      reason: "at-capacity",
      ceiling: MAX_EMBED_ORIGINS,
    })
  })

  it("is not found for a page somebody else owns", async () => {
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
    const theirPage = await aPage(theirProject.id)

    expect(
      await registerOrigin({ ...tenant, projectId: theirProject.id }, theirPage, "example.com"),
    ).toEqual({ ok: false, reason: "not-found" })
  })
})

describe("removing one", () => {
  it("takes it off the list", async () => {
    const added = await registerOrigin(tenant, pageId, "example.com")

    if (!added.ok) throw new Error("expected it to be registered")

    expect(await removeOrigin(tenant, pageId, added.origin.id)).toBe(true)
    expect(await listOrigins(tenant, pageId)).toEqual([])
  })

  it("lets a merchant remove the last one", async () => {
    /*
     * Not refused. An embed with no origins is frame-ancestors 'none' and
     * stops working everywhere — which is how you switch an embed off
     * without unpublishing the page.
     */
    const added = await registerOrigin(tenant, pageId, "example.com")

    if (!added.ok) throw new Error("expected it to be registered")

    expect(await removeOrigin(tenant, pageId, added.origin.id)).toBe(true)
  })

  it("is false for one that is not there", async () => {
    expect(await removeOrigin(tenant, pageId, "eor_nothing")).toBe(false)
  })
})

describe("the copy the proxy reads", () => {
  it("holds the list after a domain is registered", async () => {
    await registerOrigin(tenant, pageId, "example.com")

    // The proxy has no database. A change that misses the cache is a change
    // that has not taken effect.
    expect(await readEmbedOrigins(pageId)).toEqual(["https://example.com"])
  })

  it("keeps up as the list grows", async () => {
    await registerOrigin(tenant, pageId, "a.example")
    await registerOrigin(tenant, pageId, "b.example")

    expect([...((await readEmbedOrigins(pageId)) ?? [])].sort()).toEqual([
      "https://a.example",
      "https://b.example",
    ])
  })

  it("drops a removed domain", async () => {
    const added = await registerOrigin(tenant, pageId, "gone.example")

    if (!added.ok) throw new Error("expected it to be registered")

    await registerOrigin(tenant, pageId, "stays.example")
    await removeOrigin(tenant, pageId, added.origin.id)

    expect(await readEmbedOrigins(pageId)).toEqual(["https://stays.example"])
  })

  it("is an empty list, not a missing key, once the last one goes", async () => {
    const added = await registerOrigin(tenant, pageId, "only.example")

    if (!added.ok) throw new Error("expected it to be registered")
    await removeOrigin(tenant, pageId, added.origin.id)

    /*
     * Both read as 'none' to a header. They are kept apart because one is a
     * page written with no origins and the other is a copy that went
     * missing, and only the second is worth a line in a log.
     */
    expect(await readEmbedOrigins(pageId)).toEqual([])
  })

  it("is not rewritten for a delete that removed nothing", async () => {
    await registerOrigin(tenant, pageId, "example.com")
    await redis.del(`cs:embed-origins:${pageId}`)

    expect(await removeOrigin(tenant, pageId, "eor_nothing")).toBe(false)
    // A panel sending a stale id should not rewrite the key as a side effect.
    expect(await readEmbedOrigins(pageId)).toBeNull()
  })

  it("holds nothing for a page nobody registered against", async () => {
    expect(await readEmbedOrigins(pageId)).toBeNull()
  })
})
