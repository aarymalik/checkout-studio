import type { ApiFailure, ApiSuccess } from "@checkout-studio/types"
import { type AppError } from "@checkout-studio/utils"

/**
 * The response envelope from docs/api-spec.md.
 *
 * Every endpoint returns this shape, success or failure, so a client never has
 * to guess how to read a response. The correlation id is present on both, and
 * is what a user quotes to support.
 */

export function success<T>(data: T, correlationId: string, meta: Record<string, unknown> = {}) {
  return {
    success: true as const,
    data,
    error: null,
    meta: { correlationId, timestamp: new Date().toISOString(), ...meta },
  } satisfies ApiSuccess<T>
}

export function failure(error: AppError, correlationId: string): ApiFailure {
  return {
    success: false,
    data: null,
    // toPublic() carries the user-facing message only: never the internal
    // message, the cause, or a stack.
    error: {
      code: error.code,
      message: error.userMessage,
      ...(error.details ? { details: error.details } : {}),
    },
    meta: { correlationId, timestamp: new Date().toISOString() },
  }
}

export function toResponse(error: AppError, correlationId: string): Response {
  return Response.json(failure(error, correlationId), {
    status: error.status,
    headers: {
      "x-correlation-id": correlationId,
      ...(error.code === "RATE_LIMITED" && typeof error.context["retryAfterSeconds"] === "number"
        ? { "retry-after": String(error.context["retryAfterSeconds"]) }
        : {}),
    },
  })
}
