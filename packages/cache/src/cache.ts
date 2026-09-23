import "server-only"

import { logger } from "@checkout-studio/observability"
import { redis } from "./client"

/**
 * Typed cache helpers.
 *
 * Every read degrades: if Redis is unreachable, the caller gets a miss and
 * goes to the source. A cache outage must slow the product down, never break
 * it. See docs/error-handling.md.
 */

export interface CacheOptions {
  /** Seconds. */
  ttl: number
}

/** Namespaced so one subsystem's keys can be invalidated without touching others. */
export function cacheKey(namespace: string, ...parts: Array<string | number>): string {
  return `cs:${namespace}:${parts.join(":")}`
}

export async function get<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  } catch (error) {
    logger.warn("cache.read.failed", { key }, error)
    return undefined
  }
}

export async function set<T>(key: string, value: T, options: CacheOptions): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", options.ttl)
  } catch (error) {
    logger.warn("cache.write.failed", { key }, error)
  }
}

export async function del(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  try {
    await redis.del(...keys)
  } catch (error) {
    logger.warn("cache.delete.failed", { keyCount: keys.length }, error)
  }
}

/**
 * Read through the cache, computing on a miss.
 *
 * A failure to cache never fails the read: the computed value is returned
 * either way.
 */
export async function remember<T>(
  key: string,
  options: CacheOptions,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = await get<T>(key)
  if (cached !== undefined) return cached

  const value = await compute()
  await set(key, value, options)
  return value
}
