import { createError } from "../AppError"

export const infrastructureErrors = {
  network: (detail: string) =>
    createError({
      code: "NETWORK_ERROR",
      domain: "network",
      severity: "warning",
      recoverability: "retryable",
      message: `Network request failed: ${detail}`,
      userMessage: "We couldn't reach the server. Your work is saved locally.",
      remediation: { label: "Retry", action: "retry" },
      status: 503,
    }),

  timeout: (operation: string, ms: number) =>
    createError({
      code: "TIMEOUT",
      domain: "network",
      severity: "warning",
      recoverability: "retryable",
      message: `${operation} timed out after ${ms}ms`,
      userMessage: "That took too long. Try again.",
      remediation: { label: "Retry", action: "retry" },
      status: 504,
      context: { operation, ms },
    }),

  serviceUnavailable: (service: string) =>
    createError({
      code: "SERVICE_UNAVAILABLE",
      domain: "external",
      severity: "error",
      recoverability: "retryable",
      message: `${service} is unavailable`,
      userMessage: "A service we depend on is temporarily unavailable.",
      status: 503,
      context: { service },
    }),

  database: (operation: string, cause?: unknown) =>
    createError({
      code: "DATABASE_ERROR",
      domain: "internal",
      severity: "critical",
      recoverability: "retryable",
      message: `Database operation failed: ${operation}`,
      userMessage: "Something went wrong on our side. We've been notified.",
      status: 500,
      context: { operation },
      cause,
    }),

  storage: (operation: string, cause?: unknown) =>
    createError({
      code: "STORAGE_ERROR",
      domain: "storage",
      severity: "error",
      recoverability: "retryable",
      message: `Storage operation failed: ${operation}`,
      userMessage: "We couldn't save that file. Try again.",
      remediation: { label: "Retry", action: "retry" },
      status: 502,
      context: { operation },
      cause,
    }),

  /** The catch-all. Never carries detail to the client. */
  unexpected: (cause: unknown) =>
    createError({
      code: "INTERNAL_ERROR",
      domain: "internal",
      severity: "critical",
      recoverability: "user-retryable",
      message: cause instanceof Error ? cause.message : `Unexpected value thrown: ${String(cause)}`,
      userMessage: "Something went wrong. We've been notified.",
      remediation: { label: "Try again", action: "retry" },
      status: 500,
      cause,
    }),
} as const
