import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { isAuthConfigured } from "@checkout-studio/api"

/**
 * Route protection.
 *
 * Next 16 renamed `middleware` to `proxy`; the file name is the convention
 * the framework looks for.
 *
 * Everything under the dashboard and the studio requires a session. Health
 * endpoints and the marketing pages do not.
 *
 * With placeholder Clerk credentials there is no identity provider to talk to,
 * so protected routes are refused here rather than the whole application
 * failing to start. Production cannot reach that branch: the environment
 * schema rejects placeholder values.
 */
const isProtected = createRouteMatcher(["/dashboard(.*)", "/projects(.*)", "/settings(.*)"])

const unconfigured = (request: NextRequest): NextResponse | undefined => {
  if (!isProtected(request)) return undefined

  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is not configured in this environment.",
      },
      meta: { correlationId: "n/a", timestamp: new Date().toISOString() },
    },
    { status: 401 },
  )
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isProtected(request)) {
    await auth.protect()
  }
  return NextResponse.next()
})

export default function proxy(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  if (!isAuthConfigured()) {
    return unconfigured(request) ?? NextResponse.next()
  }
  return withClerk(request, event)
}

export const config = {
  matcher: [
    // Everything except static assets and Next internals.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
}
