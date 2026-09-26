import { currentContext } from "../context/current"
import { metrics } from "../metrics/metrics"

/**
 * Spans.
 *
 * Names are low cardinality and describe the operation, not its subject:
 * `db.revision.insert`, never `insert revision rev_9f2a`. Subjects are
 * attributes. See docs/observability.md.
 */

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined
}

export interface Span {
  name: string
  setAttributes: (attributes: SpanAttributes) => void
  durationMs: number
}

export interface TraceOptions {
  attributes?: SpanAttributes
  /** Emits a histogram of the span's duration under this metric name. */
  metric?: string
}

export async function span<T>(
  name: string,
  operation: (span: Span) => Promise<T> | T,
  options: TraceOptions = {},
): Promise<T> {
  const started = performance.now()
  const attributes: SpanAttributes = { ...options.attributes }
  const context = currentContext()

  const handle: Span = {
    name,
    setAttributes: (next) => Object.assign(attributes, next),
    get durationMs() {
      return performance.now() - started
    },
  }

  try {
    const result = await operation(handle)

    if (options.metric) {
      metrics.histogram(options.metric, performance.now() - started, {
        ...(context?.surface ? { surface: context.surface } : {}),
        outcome: "success",
      })
    }

    return result
  } catch (error) {
    if (options.metric) {
      metrics.histogram(options.metric, performance.now() - started, {
        ...(context?.surface ? { surface: context.surface } : {}),
        outcome: "failure",
      })
    }
    throw error
  }
}
