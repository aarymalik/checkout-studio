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
 * Waits for the connection to be usable, then round-trips a PING.
 *
 * ioredis connects asynchronously, so the first request after a cold start can
 * arrive before the socket is ready. Reporting that as unhealthy would return
 * 503 on every deploy's first probe — and a platform that restarts on 503
 * would never let the process finish connecting.
 */
export async function ping(timeoutMs = 2_000): Promise<void> {
  if (redis.status !== "ready") {
    await new Promise<void>((resolve, reject) => {
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

  await redis.ping()
}
