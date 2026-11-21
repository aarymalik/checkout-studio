import { NextResponse } from "next/server"

import { securityHeaders } from "./security-headers"

/**
 * The security headers on every renderer response.
 *
 * docs/security.md § Security Headers says to always send six. Until this
 * file existed none were sent, because there was no proxy and no `headers()`
 * in `next.config.ts` — a published checkout went out with browser defaults,
 * framable by anyone.
 *
 * ## Why here and not `next.config.ts`
 *
 * `headers()` there matches on paths and cannot vary by what a request
 * resolves to. These values are static today and one of them will not stay
 * static: `frame-ancestors` is per page, because the allowlist is per
 * embed. Putting the whole set somewhere that can express that keeps the
 * eventual difference in one place rather than splitting the policy across
 * two mechanisms.
 *
 * ## This file reads nothing
 *
 * Proxy "is not intended for slow data fetching", and on Vercel it may be
 * deployed apart from the application, so it holds no database client and
 * no shared module beyond the pure values above. The per-page allowlist
 * therefore cannot be read here as a Prisma query, and will arrive through
 * the cache — which on this stack is Upstash over HTTP and is built for
 * exactly this position.
 *
 * Until then every route is `'none'`, which is the correct default and the
 * behaviour docs/security.md already specifies for everything that is not
 * an embed.
 */
export function proxy(): NextResponse {
  const response = NextResponse.next()

  for (const [name, value] of Object.entries(securityHeaders({ frameAncestors: "'none'" }))) {
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
