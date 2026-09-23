/**
 * Metrics.
 *
 * Labels are constrained by the type system, because unbounded cardinality is
 * the single most common way observability costs run away — and the failure
 * mode is a surprise invoice, not an error. Ids belong in logs and traces,
 * where storage is linear rather than combinatorial.
 *
 * See docs/observability.md.
 */

/** The only labels any metric may carry. */
export interface MetricLabels {
  environment?: string
  release?: string
  surface?: string
  /** Templated: /projects/[id], never /projects/proj_abc123. */
  route?: string
  method?: string
  status_code?: string
  error_code?: string
  plan?: string
  component_type?: string
  interaction?: string
  mode?: string
  outcome?: string
  cache?: string
  operation?: string
  model?: string
}

export interface MetricSample {
  name: string
  kind: "counter" | "gauge" | "histogram"
  value: number
  labels: MetricLabels
  timestamp: number
}

export interface MetricsSink {
  record: (sample: MetricSample) => void
}

/** Collects in memory. Replaced by a real exporter in Phase 21. */
export function createInMemorySink() {
  const samples: MetricSample[] = []

  return {
    record: (sample: MetricSample) => {
      samples.push(sample)
    },
    samples: () => [...samples],
    clear: () => {
      samples.length = 0
    },
  }
}

export function createMetrics(sink: MetricsSink) {
  const emit = (kind: MetricSample["kind"], name: string, value: number, labels: MetricLabels) => {
    sink.record({ name, kind, value, labels, timestamp: Date.now() })
  }

  return {
    increment: (name: string, labels: MetricLabels = {}, by = 1) =>
      emit("counter", name, by, labels),
    gauge: (name: string, value: number, labels: MetricLabels = {}) =>
      emit("gauge", name, value, labels),
    histogram: (name: string, value: number, labels: MetricLabels = {}) =>
      emit("histogram", name, value, labels),
  }
}

export type Metrics = ReturnType<typeof createMetrics>

export const metricsSink = createInMemorySink()
export const metrics: Metrics = createMetrics(metricsSink)

/**
 * Replaces an id with a placeholder so a path can be a metric label.
 * `/projects/proj_abc/pages/page_def` becomes `/projects/[id]/pages/[id]`.
 */
export function templateRoute(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      /^[a-z]+_[A-Za-z0-9]{8,}$/.test(segment) || /^[0-9a-f-]{20,}$/.test(segment)
        ? "[id]"
        : segment,
    )
    .join("/")
}
