import { createError } from "../AppError"

/**
 * A resource the tenant cannot reach is reported as absent, never as
 * forbidden: "you may not see this project" confirms the project exists.
 * See docs/security.md.
 */
export const resourceErrors = {
  notFound: (entity: string, id?: string) =>
    createError({
      code: `${entity.toUpperCase()}_NOT_FOUND`,
      domain: "resource",
      severity: "error",
      recoverability: "fatal",
      message: `${entity} not found or not visible to this tenant${id ? `: ${id}` : ""}`,
      userMessage: `That ${entity.toLowerCase()} no longer exists.`,
      status: 404,
      ...(id ? { context: { entity, id } } : { context: { entity } }),
    }),

  conflict: (detail: string) =>
    createError({
      code: "CONFLICT",
      domain: "resource",
      severity: "warning",
      recoverability: "user-retryable",
      message: `Write conflict: ${detail}`,
      userMessage: "Someone else changed this. Reload to continue.",
      remediation: { label: "Reload", action: "reload" },
      status: 409,
    }),

  quotaExceeded: (input: {
    action: string
    limit: number | "unlimited"
    current: number
    planId: string
    suggestedPlan?: string
  }) =>
    createError({
      code: "QUOTA_EXCEEDED",
      domain: "resource",
      severity: "error",
      recoverability: "fatal",
      message: `${input.action} refused: ${input.current}/${String(input.limit)} on plan ${input.planId}`,
      userMessage: "You've reached your plan limit.",
      remediation: { label: "See plans", action: "navigate", href: "/settings/billing" },
      status: 403,
      details: [
        {
          path: input.action,
          code: "QUOTA_EXCEEDED",
          message: `${input.current} of ${String(input.limit)} used`,
        },
      ],
      context: {
        action: input.action,
        limit: String(input.limit),
        current: input.current,
        planId: input.planId,
        suggestedPlan: input.suggestedPlan ?? null,
      },
    }),

  rateLimited: (retryAfterSeconds: number) =>
    createError({
      code: "RATE_LIMITED",
      domain: "resource",
      severity: "warning",
      recoverability: "retryable",
      message: `Rate limit exceeded; retry after ${retryAfterSeconds}s`,
      userMessage: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
      remediation: { label: "Retry", action: "retry" },
      status: 429,
      context: { retryAfterSeconds },
    }),
} as const
