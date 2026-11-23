import type * as CacheModule from "@checkout-studio/cache"
import type * as ObservabilityModule from "@checkout-studio/observability"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Where a browser says it refused to frame a checkout.
 *
 * Two things matter here and nothing else does: that what is logged is
 * enough for support to act on, and that it is no more than an origin. A
 * report carries the merchant's full page URL, whose path can hold a cart
 * id or a search.
 */

const { warn, rateLimit } = vi.hoisted(() => ({ warn: vi.fn(), rateLimit: vi.fn() }))

vi.mock("@checkout-studio/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof ObservabilityModule>()

  return { ...actual, logger: { ...actual.logger, warn } }
})

vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return { ...actual, rateLimit }
})

const { POST } = await import("./route")

function report(body: unknown, contentType = "application/reports+json"): Request {
  return new Request("http://localhost/api/csp-reports", {
    method: "POST",
    headers: { "content-type": contentType, "x-forwarded-for": "203.0.113.5" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

/** What a browser sends under the Reporting API. */
function modern(over: Record<string, unknown> = {}): unknown {
  return [
    {
      type: "csp-violation",
      body: {
        documentURL: "https://checkout.example.com/embed/pag_one",
        blockedURL: "https://shop.example.com/cart?items=hat,coat",
        effectiveDirective: "frame-ancestors",
        referrer: "https://shop.example.com/cart?items=hat,coat",
        ...over,
      },
    },
  ]
}

beforeEach(() => {
  warn.mockReset()
  rateLimit.mockReset()
  rateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfter: 0 })
})

describe("a violation report", () => {
  it("records the page and the directive", async () => {
    const response = await POST(report(modern()))

    expect(response.status).toBe(204)
    expect(warn).toHaveBeenCalledWith(
      "renderer.csp.violation",
      expect.objectContaining({ pageId: "pag_one", directive: "frame-ancestors" }),
    )
  })

  it("keeps the origin and drops the path it came with", async () => {
    await POST(report(modern()))

    /*
     * The framing URL is the merchant's own page and its path can hold a
     * cart id, a search or an order reference. The origin is the whole of
     * what the allowlist is about.
     */
    const logged = warn.mock.calls[0]?.[1] as Record<string, unknown>

    expect(logged["blockedOrigin"]).toBe("https://shop.example.com")
    expect(logged["referrerOrigin"]).toBe("https://shop.example.com")
    expect(JSON.stringify(logged)).not.toContain("cart")
  })

  it("reads the older csp-report shape too", async () => {
    await POST(
      report(
        {
          "csp-report": {
            "document-uri": "https://checkout.example.com/embed/pag_two",
            "blocked-uri": "https://other.example/path",
            "violated-directive": "frame-ancestors",
          },
        },
        "application/csp-report",
      ),
    )

    // Which format a browser uses is the browser's decision, not ours.
    expect(warn).toHaveBeenCalledWith(
      "renderer.csp.violation",
      expect.objectContaining({ pageId: "pag_two", blockedOrigin: "https://other.example" }),
    )
  })

  it("keeps a keyword a blocked URL can be, rather than dropping it", async () => {
    await POST(report(modern({ blockedURL: "inline" })))

    expect((warn.mock.calls[0]?.[1] as Record<string, unknown>)["blockedOrigin"]).toBe("inline")
  })

  it("has no page for a report about something that is not an embed", async () => {
    await POST(report(modern({ documentURL: "https://checkout.example.com/acme/checkout" })))

    expect((warn.mock.calls[0]?.[1] as Record<string, unknown>)["pageId"]).toBeNull()
  })
})

describe("what it refuses to do", () => {
  it("answers the same for a body that makes no sense", async () => {
    for (const body of ["not json", {}, [], { "csp-report": undefined }]) {
      const response = await POST(report(body))

      expect(response.status).toBe(204)
    }

    // Nothing acts on the answer, so a status that varied with what we
    // understood would only tell a prober what we parse.
    expect(warn).not.toHaveBeenCalled()
  })

  it("discards a body too large to be a report", async () => {
    await POST(report(JSON.stringify(modern()).padEnd(9_000, " ")))

    expect(warn).not.toHaveBeenCalled()
  })

  it("backs a browser off when it sends too many", async () => {
    rateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 30 })

    const response = await POST(report(modern()))

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("30")
    expect(warn).not.toHaveBeenCalled()
  })

  it("limits by the address the report came from", async () => {
    await POST(report(modern()))

    expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({ subject: "203.0.113.5" }))
  })
})
