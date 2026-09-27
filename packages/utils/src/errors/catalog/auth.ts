import { createError } from "../AppError"

export const authErrors = {
  /**
   * A sign-in that did not work, for any reason.
   *
   * One error for an unknown address, a wrong password and an unverified
   * account alike. The three are deliberately indistinguishable: the sign-in
   * service already takes the same time for each, and naming which one it was
   * would hand back exactly what that costs to protect.
   */
  invalidCredentials: () =>
    createError({
      code: "INVALID_CREDENTIALS",
      domain: "auth",
      severity: "info",
      recoverability: "user-retryable",
      // The internal message is no more specific than the public one. There is
      // nothing here worth writing down that is not worth saying aloud, and a
      // log line naming which half was wrong is a log line worth stealing.
      message: "Sign-in refused",
      userMessage: "That email address and password do not match an account.",
      remediation: { label: "Reset your password", action: "navigate", href: "/forgot" },
      status: 401,
    }),

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
