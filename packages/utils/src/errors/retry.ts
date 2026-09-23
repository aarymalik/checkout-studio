import { type AppError } from "./AppError"
import { normalizeError } from "./normalize"

/**
 * Retry with exponential backoff and full jitter.
 *
 * Only idempotent operations retry automatically. Jitter matters: without it,
 * every client that failed at the same moment retries at the same moment, and
 * the recovering service is knocked over again.
 */

export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  jitter: boolean
  /** Only these codes are retried. */
  retryOn: readonly string[]
  /** Never retried, whatever else says. */
  neverRetry: readonly string[]
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5_000,
  jitter: true,
  retryOn: ["NETWORK_ERROR", "TIMEOUT", "SERVICE_UNAVAILABLE", "DATABASE_ERROR", "STORAGE_ERROR"],
  neverRetry: [
    "VALIDATION_ERROR",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "CONFLICT",
    "PAYMENT_DECLINED",
    "QUOTA_EXCEEDED",
  ],
}

/** Autosave never gives up while the tab is open; its queue is durable. */
export const autosaveRetryPolicy: RetryPolicy = {
  ...defaultRetryPolicy,
  maxAttempts: Number.POSITIVE_INFINITY,
  maxDelayMs: 30_000,
}

export function shouldRetry(error: AppError, policy: RetryPolicy): boolean {
  if (policy.neverRetry.includes(error.code)) return false
  if (policy.retryOn.includes(error.code)) return true
  return error.isRetryable
}

export function delayFor(attempt: number, policy: RetryPolicy): number {
  const exponential = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs)
  return policy.jitter ? Math.random() * exponential : exponential
}

export interface RetryOptions {
  policy?: RetryPolicy
  /** Called before each wait, for logging. */
  onRetry?: (error: AppError, attempt: number, delayMs: number) => void
  /** Injected in tests so they do not actually wait. */
  sleep?: (ms: number) => Promise<void>
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const policy = options.policy ?? defaultRetryPolicy
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  let attempt = 0

  for (;;) {
    try {
      return await operation()
    } catch (thrown) {
      const error = normalizeError(thrown)
      attempt += 1

      if (attempt >= policy.maxAttempts || !shouldRetry(error, policy)) {
        throw error
      }

      const delay = delayFor(attempt - 1, policy)
      options.onRetry?.(error, attempt, delay)
      await sleep(delay)
    }
  }
}
