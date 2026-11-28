import type * as ApiModule from "@checkout-studio/api"
import type { SnapshotOutcome } from "@checkout-studio/api"
import type * as CacheModule from "@checkout-studio/cache"
import type * as DatabaseModule from "@checkout-studio/database"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * A page's history, and adding to it on purpose.
 *
 * Only what is true over HTTP. The listing's shape is the repository's and
 * is tested against a real database there; what matters here is that a
 * refusal lands on the thing it is about.
 */

const { snapshotPage, list } = vi.hoisted(() => ({ snapshotPage: vi.fn(), list: vi.fn() }))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return { ...actual, authenticate: async () => ({ userId: "user_1" }), snapshotPage }
})

vi.mock("@checkout-studio/database", async (importOriginal) => {
  const actual = await importOriginal<typeof DatabaseModule>()

  return { ...actual, revisionRepository: { ...actual.revisionRepository, list } }
})

vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return { ...actual, rateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 0 }) }
})

const { GET, POST } = await import("./route")

const PARAMS = { params: Promise.resolve({ pageId: "pag_1" }) }

function post(body: unknown): Request {
  return new Request("http://localhost/api/pages/pag_1/revisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function envelope(response: Response) {
  return (await response.json()) as {
    data: Record<string, unknown> | null
    error: { details?: readonly { path: string; code: string; message: string }[] } | null
  }
}

beforeEach(() => {
  snapshotPage.mockReset()
  list.mockReset()
  list.mockResolvedValue([])
})

describe("listing a page's history", () => {
  it("answers with what the page has", async () => {
    list.mockResolvedValue([{ id: "rev_1", number: 1, kind: "publish", name: null }])

    const response = await GET(new Request("http://localhost/api/pages/pag_1/revisions"), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toMatchObject({
      revisions: [{ id: "rev_1", number: 1 }],
    })
    expect(list).toHaveBeenCalledWith({ userId: "user_1" }, "pag_1")
  })
})

describe("keeping a named version", () => {
  it("answers with the revision it wrote", async () => {
    snapshotPage.mockResolvedValue({
      ok: true,
      revisionId: "rev_2",
      revisionNumber: 2,
    } satisfies SnapshotOutcome)

    const body = await envelope(await POST(post({ name: "Before the rewrite" }), PARAMS))

    expect(body.data).toEqual({ revision: { id: "rev_2", number: 2 } })
    expect(snapshotPage).toHaveBeenCalledWith(
      { userId: "user_1" },
      expect.objectContaining({ pageId: "pag_1", name: "Before the rewrite" }),
    )
  })

  it("puts a missing name on the name box", async () => {
    snapshotPage.mockResolvedValue({ ok: false, reason: "unnamed" } satisfies SnapshotOutcome)

    const response = await POST(post({ name: "   " }), PARAMS)
    const body = await envelope(response)

    expect(response.status).toBe(422)
    expect(body.error?.details?.[0]).toMatchObject({ path: "name", code: "unnamed" })
  })

  it("puts an unreadable draft on the page, not on the name box", async () => {
    snapshotPage.mockResolvedValue({ ok: false, reason: "unreadable" } satisfies SnapshotOutcome)

    const body = await envelope(await POST(post({ name: "Doomed" }), PARAMS))

    /*
     * Nothing is wrong with what they typed. Saying so against the name
     * field would send somebody to fix the one thing that is fine.
     */
    expect(body.error?.details?.[0]?.path).toBe("page")
  })

  it("is a 404 for a page this caller does not own", async () => {
    snapshotPage.mockResolvedValue({ ok: false, reason: "not-found" } satisfies SnapshotOutcome)

    expect((await POST(post({ name: "Mine" }), PARAMS)).status).toBe(404)
  })

  it("records the renderer build that drew it", async () => {
    snapshotPage.mockResolvedValue({ ok: true, revisionId: "r", revisionNumber: 1 })

    await POST(post({ name: "Kept" }), PARAMS)

    const [, input] = snapshotPage.mock.calls[0] as [unknown, { rendererVersion: string }]

    expect(input.rendererVersion).toMatch(/^\d+\.\d+\.\d+$/u)
  })
})
