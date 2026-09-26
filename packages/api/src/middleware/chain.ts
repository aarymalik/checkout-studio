import "server-only"

import { rateLimit } from "@checkout-studio/cache"
import { createCorrelationId, type Environment, type Surface } from "@checkout-studio/observability"
// The request context lives behind the server entry: it is AsyncLocalStorage,
// which a browser has no equivalent for.
import { createContext, enrichContext, runWithContext } from "@checkout-studio/observability/server"
import { Errors, type AppError } from "@checkout-studio/utils"
import type { ZodType } from "zod"
import { withErrorHandling } from "../errors/withErrorHandling"
import { success } from "../errors/response"

/**
 * The middleware chain.
 *
 * Authenticate, authorize, validate, execute, return a sanitised response —
 * in that order, every time, per docs/security.md. A route file does not
 * repeat this plumbing; it supplies the handler.
 */

export interface RequestContext {
  request: Request
  correlationId: string
  userId: string
  params: Record<string, string>
}

export interface AuthenticatedUser {
  userId: string
}

export interface RouteOptions<TBody> {
  /** Resolves the caller. Returns null when there is no valid session. */
  authenticate: (request: Request) => Promise<AuthenticatedUser | null>
  /** Omit for public endpoints. */
  requireAuth?: boolean
  /** Validates the request body before the handler runs. */
  body?: ZodType<TBody>
  rateLimit?: { scope: string; limit: number; windowSeconds: number }
  surface?: Surface
}

export interface HandlerArgs<TBody> extends RequestContext {
  body: TBody
}

const environment = (process.env["NODE_ENV"] ?? "development") as Environment
const release = process.env["APP_VERSION"] ?? "0.0.0"

function subjectFor(request: Request, userId: string | undefined): string {
  if (userId) return userId
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous"
  )
}

export function route<TBody = undefined>(
  options: RouteOptions<TBody>,
  handler: (args: HandlerArgs<TBody>) => Promise<unknown>,
) {
  return async (
    request: Request,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<Response> => {
    // A caller-supplied correlation id is honoured so a trace spans services.
    const correlationId = request.headers.get("x-correlation-id") ?? createCorrelationId()

    const telemetry = createContext({
      surface: options.surface ?? "api",
      environment,
      release,
      correlationId,
    })

    return runWithContext(telemetry, () =>
      withErrorHandling(request, correlationId, async () => {
        const user = await options.authenticate(request)

        if (options.requireAuth !== false && !user) {
          throw Errors.auth.unauthorized()
        }

        if (user) enrichContext({ userId: user.userId })

        if (options.rateLimit) {
          const result = await rateLimit({
            scope: options.rateLimit.scope,
            subject: subjectFor(request, user?.userId),
            limit: options.rateLimit.limit,
            windowSeconds: options.rateLimit.windowSeconds,
          })

          if (!result.allowed) {
            throw Errors.resource.rateLimited(result.retryAfter)
          }
        }

        let body = undefined as TBody

        if (options.body) {
          const raw: unknown = await request.json().catch(() => undefined)
          const parsed = options.body.safeParse(raw)

          if (!parsed.success) {
            // Thrown, not returned: the boundary owns the response shape.
            throw normalizeZod(parsed.error)
          }

          body = parsed.data
        }

        const params = (await context?.params) ?? {}

        const data = await handler({
          request,
          correlationId,
          userId: user?.userId ?? "",
          params,
          body,
        })

        return Response.json(success(data, correlationId), {
          headers: { "x-correlation-id": correlationId },
        })
      }),
    )
  }
}

function normalizeZod(error: unknown): AppError {
  return Errors.validation.invalidInput(
    (error as { issues?: Array<{ path: unknown[]; code?: string; message: string }> }).issues?.map(
      (issue) => ({
        path: issue.path.map(String).join(".") || "(root)",
        code: issue.code ?? "invalid",
        message: issue.message,
      }),
    ) ?? [],
  )
}
