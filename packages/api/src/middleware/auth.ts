import "server-only"

import { logger } from "@checkout-studio/observability"
import { SESSION_COOKIE, resolveSession, touchSession } from "../services/auth/session"
import type { AuthenticatedUser } from "./chain"

/**
 * Authentication.
 *
 * Turns a session cookie into the user whose data the request may touch. The
 * credentials, the sessions and the tokens are ours — see docs/security.md.
 *
 * Everything this needs to know is read from the session on every request,
 * rather than carried in the cookie. A cookie that carried a role would keep
 * asserting it after the role changed, and a cookie that carried an expiry
 * would keep asserting that too after the session was revoked.
 */

/** Reads the session cookie out of a request, without a cookie library. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie")
  if (header === null) return null

  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue

    if (part.slice(0, separator).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(separator + 1).trim())
    }
  }

  return null
}

export interface AuthenticatedSession extends AuthenticatedUser {
  sessionId: string
  email: string
  emailVerified: boolean
}

/**
 * Who is making this request, or null.
 *
 * Null for every reason equally: no cookie, an unknown session, a revoked one,
 * an expired one. A route that needs to know why is a route that will one day
 * tell somebody.
 */
export async function authenticate(request: Request): Promise<AuthenticatedSession | null> {
  const token = readSessionCookie(request)
  if (token === null) return null

  const identity = await resolveSession(token)
  if (identity === null) return null

  /*
   * An unverified address cannot act.
   *
   * The account exists and the password was right, so this is not a failed
   * sign-in — it is an account that has not finished being created. Treating it
   * as unauthenticated here means no route has to remember to check.
   */
  if (!identity.emailVerified) {
    logger.info("auth.unverified", { userId: identity.userId })
    return null
  }

  // Recorded so a person can tell a live session from a forgotten one. Not
  // awaited: the request does not depend on it, and a slow write should not
  // slow a page down.
  void touchSession(identity.sessionId).catch((error: unknown) => {
    logger.warn("auth.touch_failed", { sessionId: identity.sessionId }, error)
  })

  return {
    userId: identity.userId,
    sessionId: identity.sessionId,
    email: identity.email,
    emailVerified: identity.emailVerified,
  }
}

/** For public endpoints that still want the caller when one is present. */
export async function optionalAuthentication(
  request: Request,
): Promise<AuthenticatedSession | null> {
  return authenticate(request)
}
