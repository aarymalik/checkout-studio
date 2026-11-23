import { securityHeaders } from "@checkout-studio/utils"
import type * as AllowlistModule from "./embed-allowlist"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { framingOrigins } = vi.hoisted(() => ({ framingOrigins: vi.fn() }))

vi.mock("./embed-allowlist", async (importOriginal) => {
  const actual = await importOriginal<typeof AllowlistModule>()

  return { ...actual, framingOrigins }
})

const { default: proxy, config } = await import("./proxy")

/**
 * Which policy each request gets.
 *
 * `securityHeaders` decides the values and is tested for them. What is only
 * true here is the branch: an embed asks who may frame it, everything else
 * is framable by nobody and does not ask at all.
 */

/** What the proxy asks for; see the route it names. */
const REPORTING = { reportTo: "/api/csp-reports" } as const

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://checkout.example"))
}

beforeEach(() => {
  framingOrigins.mockReset()
  framingOrigins.mockResolvedValue([])
})

describe("a request that is not an embed", () => {
  it("is framable by nobody", async () => {
    const response = await proxy(request("/acme.test/checkout"))

    // The report group is pinned deliberately: it is wire format, and the
    // CSP and `Reporting-Endpoints` have to agree on it.
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'; report-to csp",
    )
    expect(response.headers.get("reporting-endpoints")).toBe('csp="/api/csp-reports"')
    expect(response.headers.get("x-frame-options")).toBe("DENY")
  })

  it("does not ask the cache at all", async () => {
    await proxy(request("/acme.test/checkout"))

    // Every other route is 'none' without a round trip, which is both the
    // right answer and the cheap one.
    expect(framingOrigins).not.toHaveBeenCalled()
  })

  it("carries every header the policy names", async () => {
    const response = await proxy(request("/"))

    for (const [name, value] of Object.entries(
      securityHeaders({ frameAncestors: "'none'", ...REPORTING }),
    )) {
      expect(response.headers.get(name)).toBe(value)
    }
  })

  it("passes the request through rather than answering it", async () => {
    const response = await proxy(request("/"))

    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })
})

describe("an embed", () => {
  it("names the origins registered for that page", async () => {
    framingOrigins.mockResolvedValue(["https://shop.example", "https://www.shop.example"])

    const response = await proxy(request("/embed/pg_abc"))

    expect(framingOrigins).toHaveBeenCalledWith("pg_abc")
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors https://shop.example https://www.shop.example; report-to csp",
    )
  })

  it("sends no X-Frame-Options when somebody may frame it", async () => {
    framingOrigins.mockResolvedValue(["https://shop.example"])

    /*
     * It cannot express a list of origins, so beside this CSP it would be a
     * contradiction waiting for whichever browser prefers the older header.
     */
    expect((await proxy(request("/embed/pg_abc"))).headers.get("x-frame-options")).toBeNull()
  })

  it("is framable by nobody when the page has no registered origins", async () => {
    framingOrigins.mockResolvedValue([])

    const response = await proxy(request("/embed/pg_abc"))

    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'; report-to csp",
    )
    expect(response.headers.get("x-frame-options")).toBe("DENY")
  })

  it("is framable by nobody when the cache cannot answer", async () => {
    // framingOrigins swallows its own failures and answers with none. There
    // is no safe permissive fallback: the alternative to being too strict
    // is letting an unknown page be framed by anyone.
    framingOrigins.mockResolvedValue([])

    expect((await proxy(request("/embed/pg_down"))).headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'; report-to csp",
    )
  })

  it("does not treat a path nested under an embed as one", async () => {
    await proxy(request("/embed/pg_abc/anything"))

    expect(framingOrigins).not.toHaveBeenCalled()
  })
})

describe("what it runs on", () => {
  it("skips Next's own immutable output and nothing else", () => {
    const matcher = new RegExp(config.matcher.replace(/^\//u, "^/"), "u")

    for (const path of ["/", "/acme.test/checkout", "/api/submissions", "/embed/pg_1"]) {
      expect(matcher.test(path)).toBe(true)
    }

    for (const path of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico"]) {
      expect(matcher.test(path)).toBe(false)
    }
  })
})
