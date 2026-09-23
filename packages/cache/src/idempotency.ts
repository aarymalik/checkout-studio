import "server-only"

import { redis, whenReady } from "./client"

/**
 * Idempotency.
 *
 * A repeated request within the window returns the stored result rather than
 * executing again. This is what makes retry safe, and what stops a double
 * click creating two orders. See docs/error-handling.md.
 */

const WINDOW_SECONDS = 24 * 60 * 60

export type IdempotencyOutcome<T> =
  { status: "executed"; value: T } | { status: "replayed"; value: T } | { status: "in-flight" }

function key(scope: string, idempotencyKey: string): string {
  return `cs:idem:${scope}:${idempotencyKey}`
}

/**
 * Runs an operation at most once per key.
 *
 * The in-flight marker is claimed atomically with SET NX, so two concurrent
 * requests cannot both execute — the loser is told to wait rather than given
 * a half-finished answer.
 */
export async function once<T>(
  scope: string,
  idempotencyKey: string,
  operation: () => Promise<T>,
): Promise<IdempotencyOutcome<T>> {
  const storageKey = key(scope, idempotencyKey)

  await whenReady()
  const existing = await redis.get(storageKey)

  if (existing !== null) {
    const record = JSON.parse(existing) as { state: "pending" | "done"; value?: T }
    if (record.state === "done") return { status: "replayed", value: record.value as T }
    return { status: "in-flight" }
  }

  const claimed = await redis.set(
    storageKey,
    JSON.stringify({ state: "pending" }),
    "EX",
    WINDOW_SECONDS,
    "NX",
  )

  if (claimed === null) {
    return { status: "in-flight" }
  }

  try {
    const value = await operation()
    await redis.set(storageKey, JSON.stringify({ state: "done", value }), "EX", WINDOW_SECONDS)
    return { status: "executed", value }
  } catch (error) {
    // A failed attempt must not poison the key: the caller may legitimately retry.
    await redis.del(storageKey)
    throw error
  }
}
