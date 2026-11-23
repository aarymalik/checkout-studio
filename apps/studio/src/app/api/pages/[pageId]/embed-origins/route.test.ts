import type * as ApiModule from "@checkout-studio/api"
import type { OriginRegistration } from "@checkout-studio/api"
import type * as CacheModule from "@checkout-studio/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The HTTP end of registering a domain.
 *
 * Only what is true over HTTP: which status each refusal becomes, and
 * whether the sentence lands on the field a merchant typed into. Whether a
 * string is an origin is the service's decision and is tested against a
 * real database there, so nothing here reaches one.
 */

const { listOrigins, registerOrigin } = vi.hoisted(() => ({
  listOrigins: vi.fn(),
  registerOrigin: vi.fn(),
}))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return {
    ...actual,
    authenticate: async () => ({ userId: "user_1" }),
    listOrigins,
    registerOrigin,
  }
})

// The limiter is a real Redis counter over an hour-long window, so running
// this file enough times in an hour would start answering 429 — the limiter
// working, and nothing these tests ask about.
vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return { ...actual, rateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 0 }) }
})

const { GET, POST } = await import("./route")

const PARAMS = { params: Promise.resolve({ pageId: "pag_1" }) }

function post(body: unknown): Request {
  return new Request("http://localhost/api/pages/pag_1/embed-origins", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function envelope(response: Response) {
  return (await response.json()) as {
    data: Record<string, unknown> | null
    error: {
      code: string
      details?: readonly { path: string; code: string; message: string }[]
    } | null
  }
}

const REGISTERED = {
  id: "eor_1",
  origin: "https://shop.example",
  verified: false,
  createdAt: new Date(0),
}

beforeEach(() => {
  listOrigins.mockReset()
  registerOrigin.mockReset()
})

function answers(result: OriginRegistration): void {
  registerOrigin.mockResolvedValue(result)
}

describe("listing them", () => {
  it("answers with the page's own", async () => {
    listOrigins.mockResolvedValue([REGISTERED])

    const response = await GET(
      new Request("http://localhost/api/pages/pag_1/embed-origins"),
      PARAMS,
    )

    expect(response.status).toBe(200)
    expect(listOrigins).toHaveBeenCalledWith({ userId: "user_1" }, "pag_1")
  })
})

describe("registering one", () => {
  it("answers with the row and the other spelling to offer", async () => {
    answers({ ok: true, origin: REGISTERED, companion: "https://www.shop.example" })

    const body = await envelope(await POST(post({ origin: "shop.example" }), PARAMS))

    expect(body.data?.["companion"]).toBe("https://www.shop.example")
    expect(registerOrigin).toHaveBeenCalledWith({ userId: "user_1" }, "pag_1", "shop.example")
  })

  it("puts a refused domain's sentence on the field it was typed into", async () => {
    answers({
      ok: false,
      reason: "invalid",
      message: "Wildcards are not accepted. Add each subdomain you use.",
    })

    const response = await POST(post({ origin: "*.shop.example" }), PARAMS)
    const body = await envelope(response)

    expect(response.status).toBe(422)
    expect(body.error?.details?.[0]).toMatchObject({
      path: "origin",
      message: "Wildcards are not accepted. Add each subdomain you use.",
    })
  })

  it("says plainly when it is already there", async () => {
    answers({ ok: false, reason: "duplicate" })

    const body = await envelope(await POST(post({ origin: "shop.example" }), PARAMS))

    expect(body.error?.details?.[0]?.message).toBe(
      "That domain is already registered for this checkout.",
    )
  })

  it("names the ceiling the service reported, not one of its own", async () => {
    /*
     * Deliberately not 20, which is what MAX_EMBED_ORIGINS happens to be.
     * Asserting against the real number would pass just as happily if this
     * route wrote the sentence from a constant of its own and ignored what
     * it was told — which is exactly what the first version of this test
     * did not catch.
     */
    answers({ ok: false, reason: "at-capacity", ceiling: 5 })

    const body = await envelope(await POST(post({ origin: "shop.example" }), PARAMS))

    expect(body.error?.details?.[0]?.message).toBe(
      "A checkout can have 5 domains. Remove one to add another.",
    )
  })

  it("is a 404 for a page this caller does not own", async () => {
    answers({ ok: false, reason: "not-found" })

    expect((await POST(post({ origin: "shop.example" }), PARAMS)).status).toBe(404)
  })

  it("refuses a body with no origin in it", async () => {
    const response = await POST(post({}), PARAMS)

    expect(response.status).toBe(422)
    expect(registerOrigin).not.toHaveBeenCalled()
  })
})
