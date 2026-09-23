export { createLogger, logger, LOG_LEVELS } from "./logger/logger"
export type { Logger, LogLevel, LogRecord, LogValue } from "./logger/logger"

export { redact, hashValue, truncateIp, REDACTED } from "./logger/redact"

export {
  createMetrics,
  createInMemorySink,
  metrics,
  metricsSink,
  templateRoute,
} from "./metrics/metrics"
export type { Metrics, MetricLabels, MetricSample, MetricsSink } from "./metrics/metrics"

export { span } from "./tracing/tracer"
export type { Span, SpanAttributes, TraceOptions } from "./tracing/tracer"

export {
  runWithContext,
  currentContext,
  currentCorrelationId,
  enrichContext,
  createContext,
} from "./context/server"
export type { ContextSeed } from "./context/server"
export { createCorrelationId, ENVIRONMENTS, SURFACES } from "./context/TelemetryContext"
export type { TelemetryContext, Environment, Surface } from "./context/TelemetryContext"
