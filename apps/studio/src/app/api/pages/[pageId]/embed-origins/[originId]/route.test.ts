import type * as ApiModule from "@checkout-studio/api"
import type * as CacheModule from "@checkout-studio/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The HTTP end of removing a domain.
 *
 * A row that is not there and a row belonging to somebody else answer the
 * same way, which is the only interesting thing this layer decides.
 */

const { removeOrigin } = vi.hoisted(() => ({ removeOrigin: vi.fn() }))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return { ...actual, authenticate: async () => ({ userId: "user_1" }), removeOrigin }
})

// See the sibling route's test: the limiter is a real Redis counter and its
// window outlives a test run.
vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return { ...actual, rateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 0 }) }
})

const { DELETE } = await import("./route")

const PARAMS = { params: Promise.resolve({ pageId: "pag_1", originId: "eor_1" }) }

function request(): Request {
  return new Request("http://localhost/api/pages/pag_1/embed-origins/eor_1", { method: "DELETE" })
}

beforeEach(() => {
  removeOrigin.mockReset()
})

describe("removing a domain", () => {
  it("says it is gone", async () => {
    removeOrigin.mockResolvedValue(true)

    const response = await DELETE(request(), PARAMS)

    expect(response.status).toBe(200)
    expect(removeOrigin).toHaveBeenCalledWith({ userId: "user_1" }, "pag_1", "eor_1")
  })

  it("is a 404 when there was nothing to remove", async () => {
    removeOrigin.mockResolvedValue(false)

    expect((await DELETE(request(), PARAMS)).status).toBe(404)
  })

  it("lets the last one go", async () => {
    removeOrigin.mockResolvedValue(true)

    /*
     * Nothing here counts what is left. An embed with no origins is
     * frame-ancestors 'none', which is how a merchant switches an embed off
     * without unpublishing the page.
     */
    expect((await DELETE(request(), PARAMS)).status).toBe(200)
  })
})
