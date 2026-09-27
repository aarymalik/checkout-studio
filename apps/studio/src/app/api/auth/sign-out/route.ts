import {
  authenticate,
  clearedSessionCookie,
  endSession,
  route,
  serializeCookie,
} from "@checkout-studio/api"
import { cookiesAreSecure } from "@/lib/auth"

/**
 * Sign out.
 *
 * Ends the session on the server and clears the cookie. Clearing the cookie
 * alone would leave a working session behind on whatever copied it.
 */
export const POST = route(
  { authenticate, rateLimit: { scope: "auth.sign-out", limit: 30, windowSeconds: 60 } },
  async ({ request, headers }) => {
    const session = await authenticate(request)

    if (session !== null) {
      await endSession(session.userId, session.sessionId)
    }

    headers.append("set-cookie", serializeCookie(clearedSessionCookie(cookiesAreSecure())))

    return { signedOut: true }
  },
)
