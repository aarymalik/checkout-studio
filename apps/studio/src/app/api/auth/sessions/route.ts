import {
  authenticate,
  endOtherSessions,
  endSession,
  listSessions,
  route,
} from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * The sessions a person can see and end.
 *
 * Somebody who suspects their account has been used elsewhere needs two things:
 * to see that it has, and to stop it. Carries no token, hashed or otherwise.
 */
export const GET = route({ authenticate }, async ({ request }) => {
  const session = await authenticate(request)
  if (session === null) throw Errors.auth.unauthorized()

  const sessions = await listSessions(session.userId)

  return {
    sessions: sessions.map((entry) => ({
      id: entry.id,
      // Marked so the list can say "this device" rather than leaving somebody
      // to work out which row is the one they are looking at.
      current: entry.id === session.sessionId,
      userAgent: entry.userAgent,
      createdAt: entry.createdAt,
      lastUsedAt: entry.lastUsedAt,
      expiresAt: entry.expiresAt,
    })),
  }
})

/**
 * End one session, or every other one.
 *
 * Ending the current session here is deliberately not offered: that is signing
 * out, and it has its own route that also clears the cookie.
 */
export const DELETE = route(
  {
    authenticate,
    body: z.object({ sessionId: z.string().min(1).optional() }),
    rateLimit: { scope: "auth.sessions", limit: 20, windowSeconds: 60 * 60 },
  },
  async ({ body, request }) => {
    const session = await authenticate(request)
    if (session === null) throw Errors.auth.unauthorized()

    if (body.sessionId === undefined) {
      const ended = await endOtherSessions(session.userId, session.sessionId)
      return { ended }
    }

    if (body.sessionId === session.sessionId) {
      throw Errors.validation.invalidInput([
        {
          path: "sessionId",
          code: "invalid",
          message: "Use sign out to end the session you are using.",
        },
      ])
    }

    const ended = await endSession(session.userId, body.sessionId)

    return { ended: ended ? 1 : 0 }
  },
)
