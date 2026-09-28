import "server-only"

import { cookies } from "next/headers"
import { SESSION_COOKIE, authenticateToken } from "@checkout-studio/api"
import type { AuthenticatedSession } from "@checkout-studio/api"
import { redirect } from "next/navigation"
import { RETURN_TO, SIGN_IN_PATH } from "@checkout-studio/api/edge"

/**
 * Who is looking at this page.
 *
 * The proxy has already turned away anyone with no cookie at all, but a cookie
 * is not a session: it may name one that expired, was revoked, or belongs to an
 * account that never finished verifying. Every protected page resolves it here,
 * where the database is.
 */
export async function currentSession(): Promise<AuthenticatedSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value

  return token === undefined ? null : authenticateToken(token)
}

/**
 * The same, but sends them to sign in instead of returning null.
 *
 * Carries where they were going, so signing in finishes the journey rather than
 * dropping them on a dashboard.
 */
export async function requireSession(returnTo: string): Promise<AuthenticatedSession> {
  const session = await currentSession()

  if (session === null) {
    redirect(`${SIGN_IN_PATH}?${RETURN_TO}=${encodeURIComponent(returnTo)}`)
  }

  return session
}
