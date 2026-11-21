import { describe, expect, it } from "vitest"

import { securityHeaders } from "./headers"

/**
 * What every renderer response carries.
 *
 * docs/security.md § Security Headers names six. These assert the values
 * rather than their presence: a header with the wrong value is worse than a
 * missing one, because it looks handled.
 */

const NOT_FRAMABLE = { frameAncestors: "'none'" }

describe("the six", () => {
  it("sends every header the spec names", () => {
    const headers = securityHeaders(NOT_FRAMABLE)

    expect(Object.keys(headers).sort()).toEqual([
      "Content-Security-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ])
  })

  it("asks browsers to remember HTTPS for long enough to matter", () => {
    expect(securityHeaders(NOT_FRAMABLE)["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains; preload",
    )
  })

  it("sends the origin and never the path", () => {
    /*
     * A checkout URL carries a page id and can carry a session. The full
     * path going to every image host the page loads from would hand both
     * away.
     */
    expect(securityHeaders(NOT_FRAMABLE)["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
  })

  it("refuses to sniff a content type", () => {
    expect(securityHeaders(NOT_FRAMABLE)["X-Content-Type-Options"]).toBe("nosniff")
  })
})

describe("the permissions policy", () => {
  it("permits payment to this origin and to Stripe", () => {
    /*
     * RFC 0002 section 6. This is the header that switches wallets off three
     * frames down if its default is left to stand, and the failure looks
     * like a Stripe problem rather than one of ours.
     */
    expect(securityHeaders(NOT_FRAMABLE)["Permissions-Policy"]).toContain(
      'payment=(self "https://js.stripe.com")',
    )
  })

  it("denies what a checkout has no use for", () => {
    const policy = securityHeaders(NOT_FRAMABLE)["Permissions-Policy"] ?? ""

    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(policy).toContain(`${feature}=()`)
    }
  })
})

describe("who may frame the page", () => {
  it("is nobody, by default", () => {
    expect(securityHeaders(NOT_FRAMABLE)["Content-Security-Policy"]).toBe("frame-ancestors 'none'")
  })

  it("sends X-Frame-Options only when nobody may", () => {
    expect(securityHeaders(NOT_FRAMABLE)["X-Frame-Options"]).toBe("DENY")
  })

  it("carries the registered origins when some may", () => {
    const headers = securityHeaders({ frameAncestors: "https://a.example https://b.example" })

    expect(headers["Content-Security-Policy"]).toBe(
      "frame-ancestors https://a.example https://b.example",
    )
  })

  it("omits X-Frame-Options entirely for an embed", () => {
    /*
     * It has no syntax for a list of origins — ALLOW-FROM was never
     * implemented in Chrome and is gone from Firefox — so sending it beside
     * a CSP that permits two origins would be a contradiction, waiting for
     * whichever browser prefers the older header. Every browser that can
     * frame an embed reads frame-ancestors.
     */
    const headers = securityHeaders({ frameAncestors: "https://a.example" })

    expect(headers).not.toHaveProperty("X-Frame-Options")
  })

  it("leaves the rest of the policy alone either way", () => {
    const closed = securityHeaders(NOT_FRAMABLE)
    const open = securityHeaders({ frameAncestors: "https://a.example" })

    for (const name of [
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(open[name]).toBe(closed[name])
    }
  })
})
