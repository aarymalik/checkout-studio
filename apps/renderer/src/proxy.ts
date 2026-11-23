import { frameAncestors, securityHeaders } from "@checkout-studio/utils"
import { NextResponse, type NextRequest } from "next/server"

import { embeddedPageId, framingOrigins } from "./embed-allowlist"

/**
 * The security headers on every renderer response.
 *
 * docs/security.md § Security Headers says to always send six. Before this
 * file none were sent, and a published checkout went out with browser
 * defaults, framable by anyone.
 *
 * ## Why here and not `next.config.ts`
 *
 * `headers()` there matches on paths and cannot vary by what a request
 * resolves to. `frame-ancestors` has to: the allowlist is per embed. A page
 * cannot set its own response headers either, and `frame-ancestors` is
 * ignored in a meta tag, so a proxy is the only place this can be decided.
 *
 * ## What it reads, and what it does not
 *
 * No database. Proxy runs before the application, carries no client, and on
 * Vercel may be deployed apart from it. The allowlist comes over HTTP from
 * the copy the application mirrors on every change — see
 * `embed-allowlist.ts`, which answers with no origins whenever it cannot say
 * otherwise.
 *
 * Only an embed path asks at all. Every other route is `'none'` with no
 * round trip, which is both the right answer and the cheap one.
 *
 * ## Violations are reported back to us
 *
 * A refused frame renders nothing and tells a console the merchant does not
 * have open. The loader explains it on their page; `api/csp-reports` is the
 * half that reaches us, so support can see a mismatch before it is reported.
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const pageId = embeddedPageId(request.nextUrl.pathname)
  const origins = pageId === null ? [] : await framingOrigins(pageId)
  const response = NextResponse.next()

  for (const [name, value] of Object.entries(
    securityHeaders({
      frameAncestors: frameAncestors(origins),
      /*
       * Relative, so it resolves against whichever host served the page and
       * needs no environment read here. Proxy holds no configuration, and a
       * reporting endpoint written as an absolute URL would be one more
       * thing to get wrong per environment.
       */
      reportTo: "/api/csp-reports",
    }),
  )) {
    response.headers.set(name, value)
  }

  return response
}

export const config = {
  /*
   * Everything a browser renders or calls, and nothing it merely downloads.
   * Next's own static output is immutable, hashed and framed by nobody, so
   * the headers would be bytes on every asset request for no change in what
   * is possible.
   */
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
}
