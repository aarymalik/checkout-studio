import { describe, expect, it } from "vitest"

import { config, proxy } from "./proxy"
import { securityHeaders } from "./security-headers"

/**
 * That the headers reach the response.
 *
 * `security-headers.ts` decides the values and is tested for them. What is
 * only true here is the wiring — a header computed and never set is the
 * failure this file exists to catch, and it looks like nothing at all.
 */

describe("the response a visitor gets", () => {
  it("carries every header the policy names, with its value", () => {
    const response = proxy()

    for (const [name, value] of Object.entries(securityHeaders({ frameAncestors: "'none'" }))) {
      expect(response.headers.get(name)).toBe(value)
    }
  })

  it("is framable by nobody until an embed route says otherwise", () => {
    const response = proxy()

    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
  })

  it("passes the request through rather than answering it", () => {
    // A proxy that returned a body would replace every page in the app.
    expect(proxy().status).toBe(200)
    expect(proxy().headers.get("x-middleware-next")).toBe("1")
  })
})

describe("what it runs on", () => {
  it("skips Next's own immutable output and nothing else", () => {
    const matcher = new RegExp(config.matcher.replace(/^\//u, "^/").replace(/\$$/u, "$"), "u")

    for (const path of ["/", "/acme.test/checkout", "/api/submissions", "/embed/pg_1"]) {
      expect(matcher.test(path)).toBe(true)
    }

    for (const path of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico"]) {
      expect(matcher.test(path)).toBe(false)
    }
  })
})
