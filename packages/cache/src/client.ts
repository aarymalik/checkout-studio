import "server-only"

import Redis from "ioredis"

/**
 * The Redis connection.
 *
 * One client per process, cached across hot reloads for the same reason as the
 * database client. Redis is a cache and a coordination primitive here, never a
 * source of truth: every value it holds can be recomputed.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis }

function createClient(): Redis {
  const url = process.env["REDIS_URL"]

  if (!url) {
    throw new Error(
      "REDIS_URL is not set. The cache client is only constructed on the server, " +
        "where the application's validated environment provides it.",
    )
  }

  return new Redis(url, {
    // Fail fast rather than queueing work behind an unreachable cache: a
    // degraded cache must not become a degraded request.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: false,
  })
}

export const redis: Redis = globalForRedis.redis ?? createClient()

if (process.env["NODE_ENV"] !== "production") {
  globalForRedis.redis = redis
}

export type { Redis }

/**
 * Whether the connection has ever been usable.
 *
 * A process that has connected once and then lost Redis is in an outage, and
 * must fail fast. A process that has never connected is merely starting.
 */
let hasConnected = redis.status === "ready"
redis.once("ready", () => {
  hasConnected = true
})

function waitForReady(timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Redis was not ready within ${timeoutMs}ms (status: ${redis.status})`))
    }, timeoutMs)

    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    function cleanup(): void {
      clearTimeout(timer)
      redis.off("ready", onReady)
      redis.off("error", onError)
    }

    redis.once("ready", onReady)
    redis.once("error", onError)
  })
}

/**
 * Waits out a cold start, once.
 *
 * ioredis connects asynchronously and this client keeps its offline queue
 * disabled, so a command issued in the first milliseconds of a process fails
 * with "Stream isn't writeable" — a connection that has not opened yet, not an
 * outage. Every operation passes through here first so that window costs a few
 * milliseconds instead of an error.
 *
 * Afterwards this returns immediately, including when Redis is down: waiting
 * on every command during an outage would turn a degraded cache into a slow
 * product, which is exactly what `enableOfflineQueue: false` exists to prevent.
 *
 * It never throws. It is a gate, not a probe — a command that still cannot be
 * sent reports its own failure, and each caller decides how to degrade.
 */
export async function whenReady(timeoutMs = 2_000): Promise<void> {
  if (hasConnected || redis.status === "ready") return
  if (redis.status !== "connecting" && redis.status !== "connect") return

  try {
    await waitForReady(timeoutMs)
  } catch {
    // The command that follows will surface the failure with its own context.
  }
}

/**
 * Waits for the connection to be usable, then round-trips a PING.
 *
 * Reporting a cold start as unhealthy would return 503 on every deploy's first
 * probe — and a platform that restarts on 503 would never let the process
 * finish connecting. Unlike `whenReady`, this reports what it finds: the
 * health endpoint exists to tell the truth about the connection.
 */
export async function ping(timeoutMs = 2_000): Promise<void> {
  if (redis.status !== "ready") {
    await waitForReady(timeoutMs)
  }

  await redis.ping()
}
