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

/*
 * The context is read here and written in "./server".
 *
 * Everything this entry exports runs in a browser as well as on a server, which
 * is what lets a component log. The AsyncLocalStorage that carries a request's
 * context is a Node builtin, so it lives behind the "./server" entry — see
 * ./context/current.ts.
 */
export { currentContext } from "./context/current"
export type { ContextProvider } from "./context/current"
export { createCorrelationId, ENVIRONMENTS, SURFACES } from "./context/TelemetryContext"
export type { TelemetryContext, Environment, Surface } from "./context/TelemetryContext"
