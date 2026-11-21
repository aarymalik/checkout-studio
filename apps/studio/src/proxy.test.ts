import { RETURN_TO, SESSION_COOKIE, SIGN_IN_PATH } from "@checkout-studio/api/edge"
import { securityHeaders } from "@checkout-studio/utils"
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import proxy from "./proxy"

/**
 * The studio's proxy: who gets sent to sign in, and what every answer
 * carries.
 *
 * The headers matter on the refusals as much as on the pass-through. A 401
 * and a redirect are responses a browser acts on, and a security control
 * applied to two paths out of three is one somebody will find.
 */

function request(path: string, options: { signedIn?: boolean } = {}): NextRequest {
  const headers = new Headers()

  if (options.signedIn === true) headers.set("cookie", `${SESSION_COOKIE}=abc`)

  return new NextRequest(new URL(path, "http://localhost:3002"), { headers })
}

const EXPECTED = securityHeaders({ frameAncestors: "'none'" })

describe("the headers on every answer", () => {
  it.each([
    ["a page nobody needs to be signed in for", request("/sign-in")],
    ["a protected page with a session", request("/projects/p1", { signedIn: true })],
    ["a protected page without one", request("/projects/p1")],
    ["an API route without one", request("/api/pages")],
  ])("are all there for %s", (_name, input) => {
    const response = proxy(input)

    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(response.headers.get(name)).toBe(value)
    }
  })

  it("never let the studio be framed", () => {
    const response = proxy(request("/projects/p1", { signedIn: true }))

    // No embed exception here. That belongs to one route on the renderer;
    // an editor holding somebody's session has no business in a frame.
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
  })
})

describe("who is sent to sign in", () => {
  it("lets a signed-in visitor through to a protected page", () => {
    expect(proxy(request("/projects/p1", { signedIn: true })).status).toBe(200)
  })

  it("lets anybody through to an unprotected one", () => {
    expect(proxy(request("/sign-in")).status).toBe(200)
  })

  it("redirects a signed-out visitor, remembering where they were going", () => {
    const response = proxy(request("/projects/p1?tab=theme"))
    const location = new URL(response.headers.get("location") ?? "")

    expect(response.status).toBe(307)
    expect(location.pathname).toBe(SIGN_IN_PATH)
    expect(location.searchParams.get(RETURN_TO)).toBe("/projects/p1?tab=theme")
  })

  it("lets an API route through, because none of them are protected here", () => {
    /*
     * Documents what this file does today, which is not what it reads like
     * it does. `isProtected` matches /dashboard, /projects and /settings, and
     * no /api path begins with any of them — so the branch below that answers
     * a fetch with a parseable 401 cannot be reached.
     *
     * Not a hole: every API route resolves the session properly where the
     * database is, and refuses there. What is lost is the round trip this
     * file exists to save. Whether to protect /api here is a decision about
     * auth, not about headers, so this test pins the behaviour rather than
     * changing it.
     */
    expect(proxy(request("/api/projects")).status).toBe(200)
  })
})
