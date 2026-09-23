/**
 * The correlation model.
 *
 * Every signal carries this. A signal that cannot be correlated is nearly
 * worthless during an incident — it tells you something happened, but not to
 * whom, in which request, or alongside what else. See docs/observability.md.
 */
export interface TelemetryContext {
  /** Per request. Quoted back to users in error UI as a support reference. */
  correlationId: string
  sessionId?: string
  traceId?: string
  spanId?: string

  userId?: string
  organizationId?: string
  projectId?: string
  pageId?: string

  release: string
  environment: Environment
  region?: string

  surface: Surface
}

export const ENVIRONMENTS = ["local", "development", "staging", "production", "test"] as const
export type Environment = (typeof ENVIRONMENTS)[number]

export const SURFACES = ["studio", "renderer", "api", "worker", "webhook", "embed"] as const
export type Surface = (typeof SURFACES)[number]

/** Correlation ids are readable at a glance in a log line, and not guessable. */
export function createCorrelationId(): string {
  return `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`
}
