import { createError } from "../AppError"

export const authErrors = {
  unauthorized: () =>
    createError({
      code: "UNAUTHORIZED",
      domain: "auth",
      severity: "error",
      recoverability: "user-retryable",
      message: "Request carried no valid session",
      userMessage: "Please sign in to continue.",
      remediation: { label: "Sign in", action: "navigate", href: "/sign-in" },
      status: 401,
    }),

  sessionExpired: () =>
    createError({
      code: "SESSION_EXPIRED",
      domain: "auth",
      severity: "info",
      recoverability: "user-retryable",
      message: "Session expired",
      userMessage: "Your session expired. Sign in again.",
      remediation: { label: "Sign in", action: "navigate", href: "/sign-in" },
      status: 401,
    }),

  forbidden: (detail: string) =>
    createError({
      code: "FORBIDDEN",
      domain: "auth",
      severity: "error",
      recoverability: "fatal",
      message: `Authorization refused: ${detail}`,
      userMessage: "You don't have access to this.",
      status: 403,
    }),

  insufficientRole: (required: string) =>
    createError({
      code: "INSUFFICIENT_ROLE",
      domain: "auth",
      severity: "error",
      recoverability: "fatal",
      message: `Action requires the ${required} role`,
      userMessage: `This action requires ${required} access.`,
      status: 403,
      context: { required },
    }),
} as const
