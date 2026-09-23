import { currentContext } from "../context/server"
import { redact } from "./redact"

/**
 * Structured logging.
 *
 * Every line is a JSON object with a stable shape and a dot-namespaced event.
 * Interpolating values into a message makes a line that can be read once and
 * never queried, aggregated, or redacted. See docs/observability.md.
 */

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const SEVERITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

export type LogValue =
  string | number | boolean | null | undefined | LogValue[] | { [key: string]: LogValue }

export interface LogRecord {
  timestamp: string
  level: LogLevel
  event: string
  message?: string
  context?: Record<string, unknown>
  data?: Record<string, unknown>
  error?: {
    code: string
    domain: string
    severity: string
    message: string
    stack?: string
  }
  durationMs?: number
}

export interface LoggerOptions {
  level?: LogLevel
  /** Where records go. Defaults to stdout as one JSON object per line. */
  sink?: (record: LogRecord) => void
  /** Include stack traces. Never enabled for records that reach a client. */
  includeStack?: boolean
}

interface ErrorLike {
  code?: string
  domain?: string
  severity?: string
  message?: string
  stack?: string
}

function defaultSink(record: LogRecord): void {
  // One JSON object per line: the format every log pipeline can parse.
  const line = JSON.stringify(record)

  // process.stdout does not exist in the Edge runtime, where proxy code runs.
  // This module is the logging implementation, so console is the primitive
  // here rather than a rule to avoid.
  if (typeof process !== "undefined" && typeof process.stdout?.write === "function") {
    process.stdout.write(`${line}\n`)
    return
  }

  // eslint-disable-next-line no-console -- the sink of last resort
  console.log(line)
}

export function createLogger(options: LoggerOptions = {}) {
  const minimum = SEVERITY[options.level ?? "info"]
  const sink = options.sink ?? defaultSink
  const includeStack = options.includeStack ?? process.env["NODE_ENV"] !== "production"

  function write(
    level: LogLevel,
    event: string,
    data?: Record<string, unknown>,
    error?: unknown,
  ): void {
    if (SEVERITY[level] < minimum) return

    const context = currentContext()
    const candidate = error as ErrorLike | undefined

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(context ? { context: redact(context) as Record<string, unknown> } : {}),
      ...(data ? { data: redact(data) as Record<string, unknown> } : {}),
      ...(candidate
        ? {
            error: {
              code: candidate.code ?? "UNKNOWN",
              domain: candidate.domain ?? "internal",
              severity: candidate.severity ?? "error",
              message: candidate.message ?? String(error),
              ...(includeStack && candidate.stack ? { stack: candidate.stack } : {}),
            },
          }
        : {}),
    }

    sink(record)
  }

  return {
    trace: (event: string, data?: Record<string, unknown>) => write("trace", event, data),
    debug: (event: string, data?: Record<string, unknown>) => write("debug", event, data),
    info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
    warn: (event: string, data?: Record<string, unknown>, error?: unknown) =>
      write("warn", event, data, error),
    error: (event: string, data?: Record<string, unknown>, error?: unknown) =>
      write("error", event, data, error),
    fatal: (event: string, data?: Record<string, unknown>, error?: unknown) =>
      write("fatal", event, data, error),
  }
}

export type Logger = ReturnType<typeof createLogger>

export const logger: Logger = createLogger({
  level: (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info",
})
