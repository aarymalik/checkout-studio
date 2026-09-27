import { NextResponse, type NextRequest } from "next/server"
import { RETURN_TO, SESSION_COOKIE, SIGN_IN_PATH } from "@checkout-studio/api/edge"

/**
 * Route protection.
 *
 * Next 16 renamed `middleware` to `proxy`; the file name is the convention the
 * framework looks for.
 *
 * This checks only that a session cookie is *present*. It runs on the edge
 * runtime, which has no database to resolve one against, so it cannot know
 * whether the cookie names a live session — and it does not pretend to. What it
 * saves is a round trip: somebody with no cookie at all is sent to sign in
 * rather than being served a page that will immediately redirect them.
 *
 * Every protected route resolves the session properly, where the database is.
 * If this file were deleted, nothing would become reachable that is not
 * reachable now; the interface would just be slower and stranger to use.
 */
const PROTECTED = [/^\/dashboard(\/|$)/, /^\/projects(\/|$)/, /^\/settings(\/|$)/]

function isProtected(pathname: string): boolean {
  return PROTECTED.some((pattern) => pattern.test(pathname))
}

export default function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl

  if (!isProtected(pathname) || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next()
  }

  // An API route gets an answer it can parse. Redirecting a fetch to a sign-in
  // page produces a 200 full of HTML, which is the least useful thing a caller
  // can receive.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Sign in to continue." },
        meta: { correlationId: "n/a", timestamp: new Date().toISOString() },
      },
      { status: 401 },
    )
  }

  const signIn = new URL(SIGN_IN_PATH, request.url)
  // Where they were going, so signing in finishes the journey rather than
  // dropping them on a dashboard.
  signIn.searchParams.set(RETURN_TO, `${pathname}${search}`)

  return NextResponse.redirect(signIn)
}

export const config = {
  matcher: [
    // Everything except static assets and Next internals.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
}
