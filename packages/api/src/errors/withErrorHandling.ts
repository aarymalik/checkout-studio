import "server-only"

import { logger, metrics, templateRoute } from "@checkout-studio/observability"
import { normalizeError } from "@checkout-studio/utils"
import { toResponse } from "./response"

/**
 * The boundary every route handler is wrapped in.
 *
 * Catching everywhere produces a codebase where nothing fails and nothing
 * works; catching here means every failure is normalised, classified, logged
 * with its correlation id, and sanitised before it leaves the server.
 */
export async function withErrorHandling(
  request: Request,
  correlationId: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const started = performance.now()
  const route = templateRoute(new URL(request.url).pathname)

  try {
    const response = await handler()

    metrics.histogram("api_request_duration_ms", performance.now() - started, {
      route,
      method: request.method,
      status_code: String(response.status),
    })

    return response
  } catch (thrown) {
    const error = normalizeError(thrown)
    const durationMs = performance.now() - started

    logger[error.severity === "critical" ? "fatal" : "error"](
      "api.request.failed",
      { route, method: request.method, status: error.status, durationMs },
      error,
    )

    metrics.increment("api_error_total", { route, error_code: error.code })
    metrics.histogram("api_request_duration_ms", durationMs, {
      route,
      method: request.method,
      status_code: String(error.status),
    })

    return toResponse(error, correlationId)
  }
}
