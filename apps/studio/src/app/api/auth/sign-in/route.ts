import { createSession, route, serializeCookie, sessionCookie, signIn } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"
import { authDependencies, cookiesAreSecure, originOf } from "@/lib/auth"

/**
 * Sign in.
 *
 * One failure for every reason: no such address, wrong password, unverified
 * address. The service already takes the same time for each; saying which one
 * it was would give back what that buys.
 *
 * Rate limited hard. This is the route somebody guesses at.
 */
export const POST = route(
  {
    authenticate: async () => null,
    requireAuth: false,
    body: z.object({
      email: z.string().email().max(320),
      password: z.string().min(1).max(256),
    }),
    rateLimit: { scope: "auth.sign-in", limit: 10, windowSeconds: 15 * 60 },
  },
  async ({ body, request, headers }) => {
    const result = await signIn(body)

    if (result === null) {
      throw Errors.auth.invalidCredentials()
    }

    const session = await createSession(
      result.userId,
      originOf(request),
      authDependencies().sessionSecret,
    )

    headers.append(
      "set-cookie",
      serializeCookie(sessionCookie(session.token, session.expiresAt, cookiesAreSecure())),
    )

    return { signedIn: true }
  },
)
