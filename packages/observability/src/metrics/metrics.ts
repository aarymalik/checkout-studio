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
  /** Bounded by the command registry, which is a fixed list per build. */
  command_id?: string
  /** How the user reached a command: keyboard, palette, toolbar. */
  source?: string
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

/**
 * Collects in memory, keeping the most recent `limit` samples.
 *
 * For a long-lived client. docs/observability.md § Bound every queue: "client
 * queues cap at 100 events, dropping oldest with a counter — telemetry must
 * never cause an out-of-memory condition". The editor is open for hours, so an
 * unbounded array of samples is a leak that grows with how much work somebody
 * gets done.
 *
 * The drop count is kept rather than discarded, because a sink that silently
 * loses data is worse than one that says how much: Phase 21's exporter needs
 * to know that what it drained is not everything.
 */
export function createBoundedSink(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`A bounded sink needs a positive integer limit, not ${limit}.`)
  }

  let samples: MetricSample[] = []
  let dropped = 0

  return {
    record: (sample: MetricSample) => {
      samples.push(sample)

      if (samples.length > limit) {
        // Oldest first. A client's most recent samples are the ones that
        // describe what the user is doing now, which is what an investigation
        // starts from.
        samples = samples.slice(samples.length - limit)
        dropped += 1
      }
    },
    samples: () => [...samples],
    /** How many were lost to the cap, since the last drain. */
    dropped: () => dropped,
    /** Takes everything and resets, for an exporter that has sent it on. */
    drain: () => {
      const taken = samples

      samples = []
      dropped = 0

      return taken
    },
  }
}

/** Collects in memory, unbounded. For a process that is not long-lived. */
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
