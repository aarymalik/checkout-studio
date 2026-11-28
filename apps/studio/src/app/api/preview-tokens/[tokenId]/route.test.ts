import type * as ApiModule from "@checkout-studio/api"
import type { PreviewRevocation } from "@checkout-studio/api"
import type * as CacheModule from "@checkout-studio/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Stopping a link that is already out in the world.
 *
 * The distinction worth testing is between a link that was already
 * revoked and one that was never this caller's — the first is success and
 * the second is not.
 */

const { revokePreview } = vi.hoisted(() => ({ revokePreview: vi.fn() }))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return { ...actual, authenticate: async () => ({ userId: "user_1" }), revokePreview }
})

vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return { ...actual, rateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 0 }) }
})

const { DELETE } = await import("./route")

const PARAMS = { params: Promise.resolve({ tokenId: "pvt_1" }) }

function request(): Request {
  return new Request("http://localhost/api/preview-tokens/pvt_1", { method: "DELETE" })
}

async function envelope(response: Response) {
  return (await response.json()) as { data: Record<string, unknown> | null }
}

beforeEach(() => {
  revokePreview.mockReset()
})

describe("revoking a link", () => {
  it("stops it", async () => {
    revokePreview.mockResolvedValue({ ok: true, changed: true } satisfies PreviewRevocation)

    const response = await DELETE(request(), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toEqual({ changed: true })
    expect(revokePreview).toHaveBeenCalledWith({ userId: "user_1" }, "pvt_1")
  })

  it("is not a failure when it was already stopped", async () => {
    revokePreview.mockResolvedValue({ ok: true, changed: false } satisfies PreviewRevocation)

    const response = await DELETE(request(), PARAMS)

    /*
     * A panel showing a list somebody has had open for a minute should
     * not report an error for getting exactly what it asked for.
     */
    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toEqual({ changed: false })
  })

  it("is a 404 for a link that is not this caller's", async () => {
    revokePreview.mockResolvedValue({ ok: false, reason: "not-found" } satisfies PreviewRevocation)

    expect((await DELETE(request(), PARAMS)).status).toBe(404)
  })
})
