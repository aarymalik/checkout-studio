import type * as ApiModule from "@checkout-studio/api"
import type { PublishOutcome, UnpublishOutcome } from "@checkout-studio/api"
import type * as CacheModule from "@checkout-studio/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The HTTP end of a page being live.
 *
 * Only what is true over HTTP: which status each outcome becomes, and
 * whether a refusal reaches the merchant in a shape a publish screen can
 * draw. The decisions are the services' and are tested against a real
 * database there, so nothing here reaches one.
 */

const { publishPage, unpublishPage } = vi.hoisted(() => ({
  publishPage: vi.fn(),
  unpublishPage: vi.fn(),
}))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return { ...actual, authenticate: async () => ({ userId: "user_1" }), publishPage, unpublishPage }
})

// The limiter is a real Redis counter over an hour-long window, so running
// this file enough times in an hour would start answering 429.
vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return { ...actual, rateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 0 }) }
})

const { DELETE, POST } = await import("./route")

const PARAMS = { params: Promise.resolve({ pageId: "pag_1" }) }

function request(method: "POST" | "DELETE"): Request {
  return new Request("http://localhost/api/pages/pag_1/publish", { method })
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

beforeEach(() => {
  publishPage.mockReset()
  unpublishPage.mockReset()
})

function publishes(result: PublishOutcome): void {
  publishPage.mockResolvedValue(result)
}

describe("putting a page live", () => {
  it("answers with the revision and whether it wrote one", async () => {
    publishes({
      ok: true,
      revisionId: "rev_1",
      revisionNumber: 3,
      created: true,
      warnings: [],
    })

    const response = await POST(request("POST"), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toMatchObject({
      revision: { id: "rev_1", number: 3 },
      created: true,
    })
  })

  it("says when it published what was already live", async () => {
    publishes({
      ok: true,
      revisionId: "rev_live",
      revisionNumber: 2,
      created: false,
      warnings: [],
    })

    /*
     * The signal a publish screen needs to say "nothing to publish"
     * rather than announcing a version that was not written. Asserted
     * separately from the created case, because a route that hardcoded
     * either would pass a test that only tried the other.
     */
    expect((await envelope(await POST(request("POST"), PARAMS))).data).toMatchObject({
      revision: { id: "rev_live", number: 2 },
      created: false,
    })
  })

  it("passes warnings through on success", async () => {
    publishes({
      ok: true,
      revisionId: "rev_1",
      revisionNumber: 1,
      created: true,
      warnings: [
        {
          rule: "core-content.heading-order",
          severity: "warning",
          message: "Check headings",
          nodeIds: ["nd_1"],
        },
      ],
    })

    const body = await envelope(await POST(request("POST"), PARAMS))

    // They did not block it and are still worth saying.
    expect((body.data?.["warnings"] as unknown[]).length).toBe(1)
  })

  it("runs this installation's rules, not none", async () => {
    publishes({ ok: true, revisionId: "rev_1", revisionNumber: 1, created: true, warnings: [] })

    await POST(request("POST"), PARAMS)

    /*
     * Which plugins are installed is the application's business, and the
     * registry handed over is the one the canvas renders through — so
     * what the editor warns about and what publishing refuses cannot
     * disagree.
     */
    const [, input] = publishPage.mock.calls[0] as [unknown, { validators: unknown[] }]

    expect(input.validators.length).toBeGreaterThan(0)
  })

  it("names the renderer build that drew it", async () => {
    publishes({ ok: true, revisionId: "rev_1", revisionNumber: 1, created: true, warnings: [] })

    await POST(request("POST"), PARAMS)

    const [, input] = publishPage.mock.calls[0] as [unknown, { rendererVersion: string }]

    expect(input.rendererVersion).toMatch(/^\d+\.\d+\.\d+$/u)
  })

  it("sends a blocked page's reasons to the field they are about", async () => {
    publishes({
      ok: false,
      reason: "blocked",
      issues: [
        {
          rule: "engine.missing-asset",
          severity: "error",
          message: "This draws an image the project no longer has.",
          nodeIds: ["nd_hero"],
        },
      ],
    })

    const response = await POST(request("POST"), PARAMS)
    const body = await envelope(response)

    expect(response.status).toBe(422)
    /*
     * Unlike a template's schema problems, these are about this
     * merchant's own page and are written for them.
     */
    expect(body.error?.details?.[0]).toMatchObject({
      path: "nd_hero",
      code: "engine.missing-asset",
      message: "This draws an image the project no longer has.",
    })
  })

  it("puts a page-wide problem on the page", async () => {
    publishes({
      ok: false,
      reason: "blocked",
      issues: [
        {
          rule: "checkout.no-product",
          severity: "error",
          message: "Nothing to sell.",
          nodeIds: [],
        },
      ],
    })

    const body = await envelope(await POST(request("POST"), PARAMS))

    // No node to point at, and the problem is still real.
    expect(body.error?.details?.[0]?.path).toBe("page")
  })

  it("is a 404 for a page this caller does not own", async () => {
    publishes({ ok: false, reason: "not-found" })

    expect((await POST(request("POST"), PARAMS)).status).toBe(404)
  })
})

describe("taking a page down", () => {
  it("says whether anything moved", async () => {
    unpublishPage.mockResolvedValue({ ok: true, changed: true } satisfies UnpublishOutcome)

    const response = await DELETE(request("DELETE"), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toEqual({ changed: true })
    expect(unpublishPage).toHaveBeenCalledWith({ userId: "user_1" }, "pag_1")
  })

  it("is not a failure when it was already down", async () => {
    unpublishPage.mockResolvedValue({ ok: true, changed: false } satisfies UnpublishOutcome)

    const response = await DELETE(request("DELETE"), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toEqual({ changed: false })
  })

  it("is a 404 for a page this caller does not own", async () => {
    unpublishPage.mockResolvedValue({ ok: false, reason: "not-found" } satisfies UnpublishOutcome)

    expect((await DELETE(request("DELETE"), PARAMS)).status).toBe(404)
  })
})
