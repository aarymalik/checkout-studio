import "server-only"

import { sessionRepository, verificationTokenRepository } from "@checkout-studio/database"
import { logger } from "@checkout-studio/observability"

/**
 * Removing what has expired.
 *
 * Neither table needs sweeping to be correct — every query filters on expiry,
 * so a row left behind is invisible rather than dangerous. This is housekeeping:
 * without it the two tables grow forever, and the indexes that keep sign-in
 * fast grow with them.
 *
 * Expired sessions are kept for a while rather than deleted the moment they
 * lapse. Somebody looking at their account after an incident should be able to
 * see the session that was used, not an empty list.
 */
export const SESSION_GRACE = 30 * 24 * 60 * 60 * 1000

/**
 * Spent and expired tokens go sooner.
 *
 * There is nothing to learn from a reset link that expired last month, and
 * every row is one more thing to hold.
 */
export const TOKEN_GRACE = 7 * 24 * 60 * 60 * 1000

export interface SweepResult {
  sessions: number
  tokens: number
}

export async function sweepExpired(now = new Date()): Promise<SweepResult> {
  const [sessions, tokens] = await Promise.all([
    sessionRepository.sweep(new Date(now.getTime() - SESSION_GRACE)),
    verificationTokenRepository.sweep(new Date(now.getTime() - TOKEN_GRACE)),
  ])

  logger.info("auth.sweep", { sessions, tokens })

  return { sessions, tokens }
}
