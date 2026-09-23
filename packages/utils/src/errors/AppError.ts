/**
 * The one error type that crosses every boundary.
 *
 * Browser, server, worker and webhook all speak this, which is what lets a
 * single taxonomy govern presentation, retry policy, alerting and the API
 * contract at once. See docs/error-handling.md.
 */

export const ERROR_DOMAINS = [
  "validation",
  "auth",
  "resource",
  "schema",
  "renderer",
  "editor",
  "plugin",
  "payment",
  "network",
  "storage",
  "external",
  "internal",
] as const
export type ErrorDomain = (typeof ERROR_DOMAINS)[number]

export const ERROR_SEVERITIES = ["info", "warning", "error", "critical"] as const
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number]

export const ERROR_RECOVERABILITIES = [
  "retryable",
  "user-retryable",
  "recoverable",
  "fatal",
] as const
export type ErrorRecoverability = (typeof ERROR_RECOVERABILITIES)[number]

export interface ErrorRemediation {
  label: string
  action?: "retry" | "reload" | "contact-support" | "navigate" | "undo"
  href?: string
}

export interface ErrorDetail {
  path: string
  code: string
  message: string
}

export type ErrorContext = Record<string, string | number | boolean | null>

export interface AppErrorInit {
  code: string
  domain: ErrorDomain
  severity: ErrorSeverity
  recoverability: ErrorRecoverability
  /** For engineers. Precise, technical, never shown to users. */
  message: string
  /** For users. Plain language, actionable, never technical. */
  userMessage: string
  remediation?: ErrorRemediation
  details?: readonly ErrorDetail[]
  context?: ErrorContext
  status?: number
  cause?: unknown
}

export class AppError extends Error {
  override readonly name = "AppError"

  readonly code: string
  readonly domain: ErrorDomain
  readonly severity: ErrorSeverity
  readonly recoverability: ErrorRecoverability
  readonly userMessage: string
  readonly remediation: ErrorRemediation | undefined
  readonly details: readonly ErrorDetail[] | undefined
  readonly context: ErrorContext
  readonly status: number
  readonly timestamp: string
  /** Set at the boundary that reports it; ties this to logs and traces. */
  correlationId: string | undefined

  constructor(init: AppErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })

    this.code = init.code
    this.domain = init.domain
    this.severity = init.severity
    this.recoverability = init.recoverability
    this.userMessage = init.userMessage
    this.remediation = init.remediation
    this.details = init.details
    this.context = init.context ?? {}
    this.status = init.status ?? defaultStatusFor(init.domain)
    this.timestamp = new Date().toISOString()
  }

  /** Safe to send to a client: no stack, no cause, no internal message. */
  toPublic(correlationId: string) {
    return {
      code: this.code,
      message: this.userMessage,
      ...(this.details ? { details: this.details } : {}),
      correlationId,
    }
  }

  get isRetryable(): boolean {
    return this.recoverability === "retryable"
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

export function createError(init: AppErrorInit): AppError {
  return new AppError(init)
}

function defaultStatusFor(domain: ErrorDomain): number {
  switch (domain) {
    case "validation":
      return 422
    case "auth":
      return 401
    case "resource":
      return 404
    case "schema":
    case "editor":
    case "plugin":
    case "renderer":
      return 400
    case "payment":
    case "external":
    case "storage":
    case "network":
      return 502
    case "internal":
      return 500
    default:
      return 500
  }
}
