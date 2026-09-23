import "server-only"

import { redis } from "./client"

/**
 * Fixed-window rate limiting.
 *
 * Deliberately simple: a counter per window, incremented atomically. It is
 * approximate at window boundaries, which is acceptable for protecting
 * endpoints — and far easier to reason about than the alternatives.
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the window resets. */
  retryAfter: number
}

export interface RateLimitOptions {
  /** What is being limited: "checkout.quote", "api.dashboard". */
  scope: string
  /** Who is being limited: a session, a user, an IP. */
  subject: string
  limit: number
  windowSeconds: number
}

export async function rateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / options.windowSeconds)
  const key = `cs:rl:${options.scope}:${options.subject}:${window}`

  try {
    const count = await redis.incr(key)

    if (count === 1) {
      await redis.expire(key, options.windowSeconds)
    }

    const ttl = await redis.ttl(key)

    return {
      allowed: count <= options.limit,
      remaining: Math.max(0, options.limit - count),
      retryAfter: ttl > 0 ? ttl : options.windowSeconds,
    }
  } catch {
    // If the limiter is unavailable, allow the request. Failing closed here
    // would turn a cache outage into a total outage.
    return { allowed: true, remaining: options.limit, retryAfter: 0 }
  }
}
