# Checkout Studio Observability Specification

**Version:** 1.0

**Status:** Telemetry, Monitoring & Operations Architecture

---

# Purpose

Observability is the ability to answer questions about the system's behavior without shipping new code to ask them.

For Checkout Studio the questions that matter are specific:

- Is the editor fast for _this_ user, on _this_ project, right now?
- Did that checkout render, and did it convert?
- Is a payment failing because of us, because of Stripe, or because of a customer's bank?
- Which plugin is degrading the canvas frame rate?
- What changed between the last good deploy and this one?
- Where did the user's hour of work go?

This document defines the telemetry the platform emits, how it is collected, correlated, retained, and alerted on — and, equally importantly, what it must never collect.

Observability is not monitoring dashboards.

It is the difference between diagnosing an incident in four minutes and four hours.

---

# Overview

Checkout Studio emits four signal types, all sharing one correlation identity.

```
     ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
     │   LOGS   │   │ METRICS  │   │  TRACES  │   │  EVENTS  │
     │ what     │   │ how much │   │ where    │   │ what the │
     │ happened │   │ how fast │   │ time     │   │ user did │
     │          │   │          │   │ went     │   │          │
     └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
          └──────────────┴──────┬───────┴──────────────┘
                                │
                         correlationId
                                │
                                ▼
                   One coherent story per request
```

The correlation id is the spine. A signal that cannot be correlated is nearly worthless during an incident.

---

# Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         PRODUCERS                              │
├──────────────┬──────────────┬──────────────┬──────────────────┤
│ Studio       │ Renderer     │ API / Server │ Background Jobs   │
│ (browser)    │ (SSR + edge) │ Actions      │ Webhooks          │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬─────────┘
       │              │              │                │
       ▼              ▼              ▼                ▼
┌────────────────────────────────────────────────────────────────┐
│                    INSTRUMENTATION LAYER                       │
│  logger · metrics · tracer · analytics · vitals · profiler     │
│  → enrichment (correlation, tenant, release, environment)      │
│  → redaction (PII, secrets)                                    │
│  → sampling                                                    │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                          TRANSPORT                             │
│  batched · async · non-blocking · lossy under pressure         │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌──────────────┬──────────────┬──────────────┬──────────────────┐
│   Sentry     │   PostHog    │  Log Sink    │   Metrics Store   │
│ errors,      │ product      │ structured   │ time series,      │
│ performance, │ analytics,   │ JSON logs    │ SLO evaluation    │
│ replay       │ funnels      │              │                   │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬─────────┘
       └──────────────┴──────┬───────┴────────────────┘
                             ▼
              ┌──────────────────────────────┐
              │  Dashboards · Alerts · SLOs  │
              └──────────────┬───────────────┘
                             ▼
                         On-call
```

The instrumentation layer is our own thin abstraction over vendors.

No application code imports a vendor SDK directly. Swapping Sentry or PostHog must be a single-package change, consistent with the plugin-first, dependency-inverted posture of [architecture.md](./architecture.md).

---

# Design Principles

**One identity, four signals.**

Everything carries `correlationId`, `sessionId`, `userId`, `projectId`, and `release`.

**Structured or nothing.**

Every log line is a JSON object with a stable shape. String interpolation into log messages is forbidden.

**Never block the user.**

Telemetry is asynchronous, batched, and lossy under pressure. A failing telemetry pipeline must be invisible to users.

**Privacy is a schema property, not a review step.**

Fields are declared safe or sensitive at the type level. Redaction is structural, not a regex over free text.

**Measure the user's experience, not the server's.**

p50 server latency is a comfort metric. INP on a mid-range Android phone is the truth.

**Cardinality is a budget.**

Every unbounded label is a future cost incident. Ids belong in logs and traces, never in metric labels.

**Instrument the boundary, not the internals.**

Wrap route handlers, service calls, and boundaries. Do not scatter timers through business logic.

**If it has an alert, it has a runbook.**

An alert without a documented response is noise that will eventually be ignored.

---

# Correlation Model

```
Request enters
      ↓
correlationId  generated (or taken from x-correlation-id)
      ↓
Bound to async context for the lifetime of the request
      ↓
Propagated to:
   • every log line
   • every span
   • every downstream call header
   • the API response meta block
   • the client error reporter
      ↓
Returned to the user in error UI as a support reference
```

```ts
export interface TelemetryContext {
  /** Per request. */
  correlationId: string
  /** Per browser session. Rotates on sign-out. */
  sessionId: string
  /** Per distributed trace. */
  traceId?: string
  spanId?: string

  /** Tenancy. */
  userId?: string
  organizationId?: string
  projectId?: string
  pageId?: string

  /** Deployment. */
  release: string
  environment: "local" | "development" | "staging" | "production"
  region?: string

  /** Surface. */
  surface: "studio" | "renderer" | "api" | "worker" | "webhook" | "embed"
}
```

Context propagates through `AsyncLocalStorage` on the server and a React context plus module singleton in the browser.

No function signature ever takes a logger as a parameter.

---

# Logging

## Levels

```
trace    Verbose developer detail. Local only. Never shipped.
debug    Diagnostic detail. Development and staging.
info     Notable business events. Production default.
warn     Degraded but continuing.
error    An operation failed.
fatal    The process or session cannot continue.
```

Production ships `info` and above. `debug` may be enabled per user for a bounded window during an investigation.

## Record Shape

Every log line, everywhere, has this shape.

```ts
export interface LogRecord {
  timestamp: string // ISO 8601, UTC
  level: LogLevel
  /** Stable, dot-namespaced. Never interpolated. */
  event: string // "page.published", "asset.upload.failed"
  message: string // human summary, still no interpolation of values

  context: TelemetryContext

  /** Structured, typed, redaction-aware. */
  data: Record<string, LogValue>

  /** Present on warn and above. */
  error?: {
    code: string
    domain: ErrorDomain
    severity: ErrorSeverity
    message: string
    stack?: string // server-side sinks only
  }

  /** Present on operations. */
  durationMs?: number
}

export type LogValue = string | number | boolean | null | LogValue[]
```

Good

```ts
logger.info("page.published", {
  pageId,
  revisionId,
  nodeCount: 247,
  durationMs: 1_284,
})
```

Forbidden

```ts
logger.info(`Published page ${pageId} with 247 nodes in 1284ms`)
console.log("publishing…")
```

The rule from [coding-standards.md](./coding-standards.md) — never `console.log` in production — exists because unstructured output cannot be queried, aggregated, or redacted.

## Event Namespace

```
auth.*        signin, signout, session.expired
project.*     created, renamed, deleted, restored
page.*        created, duplicated, published, unpublished
revision.*    created, restored, compared
editor.*      session.start, session.end, autosave.*, history.*
asset.*       upload.*, delete, optimize.*
template.*    installed, exported, published
theme.*       updated, preset.applied
plugin.*      loaded, failed, disabled
schema.*      validated, migrated, invalid
render.*      start, complete, fallback, failed
checkout.*    viewed, started, submitted, completed, abandoned
payment.*     intent.created, succeeded, failed, refunded
webhook.*     received, verified, processed, rejected
api.*         request, response
job.*         enqueued, started, completed, failed
ai.*          request, response, rejected
```

The namespace is a product artifact, versioned alongside the code. Adding an event is a documented change, not an ad hoc decision.

## What Is Always Logged

```
Every API request and response
Every authentication event
Every publish
Every payment state transition
Every webhook (received, verified, outcome)
Every permission or role change
Every export of customer data
Every plugin load failure
Every schema validation failure
Every background job transition
```

This satisfies the logging requirements in [security.md](./security.md) and [api-spec.md](./api-spec.md).

---

# Metrics

Metrics answer "how much" and "how fast" at aggregate scale.

## Naming

```
checkout_studio_<subsystem>_<measurement>_<unit>

checkout_studio_api_request_duration_ms
checkout_studio_editor_frame_duration_ms
checkout_studio_publish_total
checkout_studio_payment_failed_total
checkout_studio_render_nodes_count
```

## Cardinality Rules

Allowed labels

```
environment    (4 values)
release        (bounded by deploy frequency)
surface        (6 values)
route          (bounded, templated: /projects/[id], never /projects/abc123)
status_code    (bounded)
error_code     (bounded by the catalog)
plan           (bounded)
component_type (bounded by the registry)
```

Forbidden labels

```
userId  projectId  pageId  nodeId  correlationId
email   ip   url   arbitrary user strings
```

Ids belong in logs and traces, where storage is linear rather than combinatorial. This is the single most common way observability costs run away, and it is prevented structurally: the metrics client's type signature only accepts the allowed label set.

## Core Metrics

### API

```
api_request_duration_ms         histogram   route, method, status
api_request_total               counter     route, method, status
api_error_total                 counter     route, error_code
api_rate_limited_total          counter     route
db_query_duration_ms            histogram   operation, model
db_connection_pool_active       gauge       —
cache_hit_total                 counter     cache
cache_miss_total                counter     cache
```

### Editor

```
editor_load_duration_ms         histogram   —
editor_frame_duration_ms        histogram   interaction
editor_dropped_frames_total     counter     interaction
editor_node_count               histogram   —
editor_memory_bytes             gauge       —
editor_autosave_duration_ms     histogram   —
editor_autosave_failed_total    counter     error_code
editor_history_depth            gauge       —
editor_command_total            counter     command_id, source
```

`source` distinguishes `keyboard`, `toolbar`, `palette`, and `menu` — which is how we learn whether shortcuts are actually being discovered, per [keyboard-shortcuts.md](./keyboard-shortcuts.md).

### Renderer

```
render_duration_ms              histogram   mode (ssr|static|embed|preview)
render_node_count               histogram   —
render_fallback_total           counter     component_type, reason
render_hydration_duration_ms    histogram   —
render_schema_invalid_total     counter     —
render_asset_failed_total       counter     asset_type
```

### Checkout & Payments

Payment semantics are defined in [stripe-integration.md](./stripe-integration.md).

```
checkout_view_total             counter     —
checkout_start_total            counter     —
checkout_completed_total        counter     —
checkout_abandoned_total        counter     stage
payment_intent_total            counter     currency
payment_succeeded_total         counter     currency, method
payment_failed_total            counter     decline_code
payment_duration_ms             histogram   —
order_created_total             counter     —
order_creation_failed_total     counter     error_code
webhook_received_total          counter     event_type
webhook_rejected_total          counter     reason
webhook_lag_ms                  histogram   event_type
```

`webhook_lag_ms` — the delay between Stripe's event timestamp and our processing — is one of the highest-value metrics in the system. It rises before anything else visibly breaks.

### Publishing

```
publish_total                   counter     outcome
publish_duration_ms             histogram   —
publish_validation_failed_total counter     error_code
cache_invalidation_duration_ms  histogram   —
```

---

# Tracing

Distributed tracing shows where time went across process boundaries.

```
POST /api/v1/pages/{id}/publish                              1,284 ms
├── auth.verify                                                 18 ms
├── db.page.findUnique                                          24 ms
├── schema.validate                                            156 ms
│   ├── structural                                              38 ms
│   ├── referential                                             41 ms
│   └── component-rules                                         77 ms
├── revision.create                                            118 ms
│   ├── schema.normalize                                        44 ms
│   ├── schema.compress                                         51 ms
│   └── db.revision.insert                                      23 ms
├── db.transaction (page.update)                                31 ms
├── cache.invalidate                                           204 ms
├── render.prewarm                                             698 ms   ← 54%
│   ├── theme.compile                                           12 ms
│   ├── component.resolve                                       61 ms
│   └── html.generate                                          625 ms
└── log.audit                                                    9 ms
```

Without this trace, "publishing feels slow" is a guess. With it, the answer is a single span.

## Span Conventions

```ts
export interface SpanAttributes {
  "checkout.surface": string
  "checkout.project_id"?: string
  "checkout.page_id"?: string
  "checkout.node_count"?: number
  "checkout.schema_version"?: string
  "checkout.release": string
  "db.model"?: string
  "db.operation"?: string
  "http.route"?: string
  "http.status_code"?: number
  "error.code"?: string
}
```

Rules

- Span names are low cardinality and describe the operation, not the subject: `db.revision.insert`, never `insert revision rev_9f2a`.
- Subjects go in attributes.
- Every span that fails records the `AppError` code from [error-handling.md](./error-handling.md).
- Traces propagate across the studio → API → worker boundary via W3C `traceparent`.

## Sampling

```
Production
  Baseline               5%
  Errors                 100%
  Slow (> p99)           100%
  Payment operations     100%
  Publish operations     100%
  Webhooks               100%

Staging                  100%
Development              100%
```

Head-based sampling with a tail override: any trace containing an error or exceeding the latency threshold is retained regardless of the sampling decision.

Payment and publish are never sampled down. They are low volume and high consequence — exactly the ratio that justifies full retention.

---

# Real User Monitoring

Server metrics describe our infrastructure. RUM describes the user's reality.

## Web Vitals

Collected on every published checkout page view and every editor load.

```
LCP    Largest Contentful Paint
INP    Interaction to Next Paint
CLS    Cumulative Layout Shift
FCP    First Contentful Paint
TTFB   Time to First Byte
```

Reported at p50, p75, and p95, segmented by

```
device class     (mobile | tablet | desktop)
connection       (4g | 3g | slow-2g | wifi)
region
release
template         (which template the page derives from)
node count       (bucketed)
```

Segmentation by template is a product signal, not just an engineering one: a template that reliably produces poor LCP is a template we should fix or retire.

Targets are those defined in [performance.md](./performance.md).

```
LCP  < 2.5s     INP < 200ms     CLS < 0.1     FCP < 1.8s
```

An alert fires when p75 of any vital exceeds its target for 15 minutes.

## Editor Performance

The editor is a long-lived application, so it is instrumented like one.

```ts
export interface EditorPerformanceSample {
  /** Rolling frame rate over the last second. */
  fps: number
  /** Longest frame in the sample window. */
  longestFrameMs: number
  /** JS heap, where the browser exposes it. */
  heapUsedBytes?: number
  nodeCount: number
  selectionCount: number
  historyDepth: number
  activePlugins: string[]
  breakpoint: Breakpoint
  zoom: number
}
```

Sampled every 10 seconds, plus immediately after any interaction exceeding 50 ms.

Interaction timings recorded individually

```
selection        target < 16 ms
drag frame       target < 16 ms
property change  target < 16 ms
node insert      target < 50 ms
breakpoint swap  target < 100 ms
undo / redo      target < 50 ms
page load        target < 2 s
```

When an interaction exceeds its target, a long-task profile is captured with the responsible plugins attributed. This is how "the editor got slow after I installed X" becomes a measurable claim.

---

# Product Analytics

Analytics answers what users do. It is separate from logs, and it is consent-governed.

## Editor Funnel

```
signup → project.created → page.created → component.added
       → stripe.connected → published → first.order
```

Measuring drop-off at each step is how the onboarding experience improves.

## Checkout Funnel

Per published page, this is the customer's revenue-critical funnel.

```
page.viewed
     ↓  view→start rate
checkout.started         (first form interaction)
     ↓
payment.attempted
     ↓  payment success rate
payment.succeeded
     ↓
order.completed
```

Abandonment is attributed to a stage, which is what makes it actionable.

```
abandoned_at: "form" | "shipping" | "payment" | "confirmation"
```

## Feature Adoption

```
Templates installed per project
Components used, by type
AI assistance accepted vs. rejected
Shortcuts used vs. equivalent mouse actions
Dark mode adoption
Breakpoints actually edited
Plugins installed and retained
```

Adoption data drives roadmap prioritization directly. A component nobody inserts is a maintenance cost with no return.

## Consent

```
Essential      always on (security, fraud, error, uptime)
Product        on by default for authenticated dashboard users, opt-out in settings
Checkout       governed by the project owner's own cookie configuration
Marketing      opt-in only
```

Analytics on **published checkouts** is the project owner's decision, made in project settings, not ours. We provide aggregate conversion metrics without setting third-party cookies.

---

# Privacy & Data Protection

The most important section of this document.

## Never Collected

```
Card numbers, CVV, expiry            (never enter our systems at all)
Passwords or credentials
Session tokens, API keys, secrets
Full request or response bodies
Raw customer form input
Free-text field contents
Precise geolocation
Uploaded file contents
AI prompt contents (unless the user explicitly opts in)
```

## Redaction

Redaction is structural. The logger's type system distinguishes safe values from sensitive ones, and sensitive values cannot be logged without an explicit transformation.

```ts
export type Redacted<T> = { readonly __redacted: unique symbol; value: T }

export function hash(value: string): string // stable, salted, one-way
export function mask(value: string): string // "j•••@example.com"
export function drop(): undefined
```

```
email       → hashed  (joins possible, identity not recoverable)
ip          → truncated to /24 or /48, retained 7 days
userAgent   → parsed to family + major version, raw discarded
phone       → dropped
name        → dropped
address     → country only
url         → path templated, query string dropped
```

A defense-in-depth scrubber runs at the transport layer over every outbound payload as a second line. Its rejections are themselves alerted on, because a rejection means a redaction bug upstream.

## Retention

```
Application logs        30 days
Error records           90 days
Traces                  14 days
Metrics (raw)           30 days
Metrics (aggregated)    13 months
Product analytics       13 months
Audit logs              7 years (immutable, per security.md)
Session replays         30 days
Web Vitals              13 months
```

Audit logs are the exception because they are a compliance artifact, not a debugging tool.

## Regional Handling

```
EU traffic       processed and stored in EU regions
Data subject     export and erasure supported across every sink
Sub-processors   documented, with DPAs
```

Erasure requests propagate to Sentry, PostHog, and log sinks, keyed on hashed user identifier.

---

# Health Checks

Extending the endpoint defined in [deployment.md](./deployment.md).

```
GET /api/health/live      liveness — is the process up? touches no dependency
GET /api/health           readiness — can it serve traffic? (the endpoint in deployment.md)
GET /api/health/deep      dependency latency detail (authenticated)
```

```json
{
  "status": "degraded",
  "version": "1.4.2",
  "release": "a1b2c3d",
  "uptimeSeconds": 84213,
  "checks": {
    "database": { "status": "healthy", "latencyMs": 12 },
    "redis": { "status": "healthy", "latencyMs": 3 },
    "storage": { "status": "healthy", "latencyMs": 45 },
    "stripe": { "status": "degraded", "latencyMs": 2840 },
    "auth": { "status": "healthy", "latencyMs": 28 }
  },
  "timestamp": "2026-09-01T10:14:22.481Z"
}
```

Semantics

```
healthy    all dependencies nominal          → 200
degraded   non-critical dependency impaired  → 200, alert raised
unhealthy  critical dependency down          → 503, removed from rotation
```

`/api/health/live` must not touch the database or any other dependency. A liveness probe that fails when the database is slow causes the platform to restart healthy processes, turning a database incident into a total outage.

`/api/health` reports dependency status, as specified in [deployment.md](./deployment.md), and is used for readiness and traffic gating — never for restarts.

---

# Service Level Objectives

SLOs make reliability a number instead of an opinion.

| SLO                                    | Target | Window | Budget |
| -------------------------------------- | ------ | ------ | ------ |
| Editor availability                    | 99.9%  | 30d    | 43 min |
| Published checkout availability        | 99.95% | 30d    | 21 min |
| Payment processing success             | 99.9%  | 30d    | 43 min |
| API latency p50 < 200 ms, p95 < 500 ms | 99%    | 30d    | 7.2 h  |
| Publish success rate                   | 99.5%  | 30d    | 3.6 h  |
| Autosave success rate                  | 99.9%  | 30d    | 43 min |
| Editor INP p75 < 200 ms                | 95%    | 30d    | 36 h   |

Published checkout availability carries the strictest target because it is the only surface where downtime is directly, immediately monetary.

## Budget Policy

```
Budget consumed  < 50%   → normal velocity
Budget consumed 50–75%   → reliability work prioritized
Budget consumed 75–100%  → feature freeze on the affected surface
Budget exhausted         → all engineering effort to reliability until recovered
```

This gives reliability a mechanical claim on engineering time, rather than requiring someone to argue for it after each incident.

---

# Alerting

## Severity

```
P1  Revenue or data at risk           page immediately, 24/7
P2  Significant degradation           page during business hours, ticket otherwise
P3  Elevated but contained            ticket, next business day
P4  Informational                     dashboard only
```

## Rules

| Alert                       | Condition                                                           | Sev           |
| --------------------------- | ------------------------------------------------------------------- | ------------- |
| Checkout down               | availability < 99% over 5 min                                       | P1            |
| Payment processing failures | non-decline failures (errors, not issuer declines) > 2% over 10 min | P1            |
| Decline rate anomaly        | issuer declines > 2× the 7-day baseline over 30 min                 | P2            |
| Amount mismatch             | any PAYMENT_AMOUNT_MISMATCH                                         | P1, immediate |
| Order creation failing      | any ORDER_CREATION_FAILED — a customer was charged without an order | P1, immediate |
| Webhook backlog             | lag p95 > 60 s over 10 min                                          | P1            |
| Database unavailable        | health check failing 2 min                                          | P1            |
| Error rate spike            | > 5% of requests over 5 min                                         | P1            |
| Autosave failing            | failure rate > 2% over 10 min                                       | P1            |
| Webhook signature failures  | > 10 in 5 min                                                       | P1 (security) |
| Editor load slow            | p95 > 5 s over 15 min                                               | P2            |
| API latency                 | p95 > 500 ms over 15 min (see performance.md)                       | P2            |
| Renderer fallback rate      | > 0.5% of views over 15 min                                         | P2            |
| Web Vitals regression       | any p75 above target 15 min                                         | P2            |
| Plugin error rate           | > 10/hour for one plugin                                            | P3            |
| SLO budget 75%              | any SLO                                                             | P3            |
| Storage quota               | > 85%                                                               | P3            |

## Alert Hygiene

Every alert must have

```
A stated user impact
A runbook link
A dashboard link
A defined owner
A tested silence path for planned maintenance
```

An alert that fires more than twice without action is deleted or fixed. Alert fatigue is how real incidents get missed, and it is a failure of engineering discipline rather than of attention.

---

# Dashboards

## Executive

```
Revenue today / 7d / 30d
Orders and AOV
Conversion rate by funnel stage
Active projects and published pages
Signup → first publish conversion
```

## Service Health

```
Request rate, error rate, duration (RED)
SLO status and budget burn
Dependency health matrix
Deploy markers overlaid on every chart
Active incidents
```

Deploy markers are non-negotiable. The first question in every incident is "what changed", and the chart should answer it before anyone asks.

## Editor Performance

```
Load time distribution
FPS distribution by node-count bucket
Interaction latency by type
Memory over session duration
Autosave success and latency
Plugin performance attribution
```

## Checkout Performance

```
Web Vitals p75 by device class
Render duration by node count
Hydration timing
Fallback rate by component type
Asset failure rate
Conversion by vitals bucket
```

That last panel is the one that ends the "does performance actually matter" argument internally, using our own data.

## Payments

```
Payment success rate by method and currency
Decline reasons, ranked
Webhook lag and processing rate
Order reconciliation status
Refund and dispute rate
```

---

# Internal Structure

```
packages/observability/
├── src/
│   ├── index.ts
│   ├── context/
│   │   ├── TelemetryContext.ts
│   │   ├── server.ts            AsyncLocalStorage propagation
│   │   └── client.ts            session + React provider
│   ├── logger/
│   │   ├── logger.ts
│   │   ├── events.ts            the event namespace, typed
│   │   ├── redact.ts
│   │   └── transports/
│   ├── metrics/
│   │   ├── metrics.ts
│   │   ├── registry.ts          all metric definitions, typed labels
│   │   └── cardinality.ts       compile-time label enforcement
│   ├── tracing/
│   │   ├── tracer.ts
│   │   ├── spans.ts
│   │   └── sampling.ts
│   ├── rum/
│   │   ├── vitals.ts
│   │   ├── editorPerf.ts
│   │   └── longTasks.ts
│   ├── analytics/
│   │   ├── analytics.ts
│   │   ├── events.ts
│   │   └── consent.ts
│   ├── reporting/
│   │   ├── errorReporter.ts
│   │   └── queue.ts
│   └── health/
│       └── checks.ts
└── package.json
```

The package exports narrow, opinionated functions.

```ts
import { logger, metrics, trace, analytics } from "@checkout-studio/observability"
```

Vendor SDKs appear only inside `transports/` and `reporting/`.

---

# Instrumentation Patterns

## API Route

```ts
export const POST = withTelemetry(async (req, ctx) => {
  return trace.span("page.publish", async (span) => {
    span.setAttributes({
      "checkout.page_id": ctx.pageId,
      "checkout.project_id": ctx.projectId,
    })

    const result = await publishPage(ctx.pageId)

    metrics.increment("publish_total", { outcome: "success" })
    metrics.histogram("publish_duration_ms", span.durationMs, {})

    logger.info("page.published", {
      pageId: ctx.pageId,
      revisionId: result.revisionId,
      nodeCount: result.nodeCount,
      durationMs: span.durationMs,
    })

    return result
  })
})
```

`withTelemetry` establishes context, generates the correlation id, records request metrics, and delegates error handling to `withErrorHandling` from [error-handling.md](./error-handling.md). A route handler never repeats this plumbing.

## Editor Interaction

```ts
export function useInstrumentedCommand(commandId: string) {
  return useCallback(
    (args?: unknown) => {
      const start = performance.now()
      try {
        runCommand(commandId, args)
      } finally {
        const duration = performance.now() - start
        metrics.histogram("editor_frame_duration_ms", duration, {
          interaction: commandId,
        })
        if (duration > 50) {
          rum.captureLongTask(commandId, duration)
        }
      }
    },
    [commandId],
  )
}
```

## Renderer

```ts
export async function renderCheckout(schema: CheckoutSchema, mode: RenderMode) {
  return trace.span("render.checkout", async (span) => {
    span.setAttributes({
      "checkout.node_count": Object.keys(schema.nodes).length,
      "checkout.schema_version": schema.version,
    })
    const html = await render(schema, mode)
    metrics.histogram("render_duration_ms", span.durationMs, { mode })
    return html
  })
}
```

---

# Workflows

## Investigating "the editor is slow"

```
1. Editor Performance dashboard → filter to the reported release
2. FPS by node-count bucket → is it universal or project-size dependent?
3. Interaction latency by type → which interaction specifically?
4. Long-task profiles → plugin attribution
5. Deploy markers → did it start at a deploy?
6. If project-specific: correlationId → trace → schema characteristics
7. Reproduce with a synthetic project of matching size
```

## Investigating a payment failure spike

```
1. P1 alert fires: payment failure rate > 5%
2. Payments dashboard → decline reasons ranked
3. Concentrated in one decline code?
      yes → likely upstream (issuer or Stripe); check Stripe status
      no  → likely ours
4. Correlate with deploy markers
5. Sample traces on payment.* spans, all retained at 100%
6. Check webhook lag — is the failure real or an observation delay?
7. Runbook: rollback path, Stripe support escalation, customer comms
```

## Diagnosing a single user's report

```
User provides the correlation id shown in the error dialog
      ↓
Log search on correlationId → the full request story
      ↓
Trace lookup on the same id → where the time went
      ↓
Sentry issue on the same id → stack, breadcrumbs, release
      ↓
Session context → node count, plugins, browser, connection
      ↓
Root cause, without ever asking the user to reproduce it
```

This workflow is the entire justification for the correlation model.

## Post-deploy verification

```
Deploy completes → release marker emitted
      ↓
Watch for 15 minutes:
   error rate, API p95, publish success, payment success,
   editor load p95, checkout availability
      ↓
Any regression beyond threshold → automatic rollback
      ↓
Clean → release marked stable
```

This is the monitoring step referenced in [release-process.md](./release-process.md).

---

# Best Practices

**Log events, not sentences.**

`"page.published"` is queryable. `"Published the page!"` is not.

**Never put an id in a metric label.**

The cost is combinatorial and the failure mode is a surprise invoice.

**Instrument at the boundary.**

Wrap the handler, not every function inside it.

**Emit a metric and a log for significant operations.**

The metric tells you it is happening at scale. The log tells you what happened to one user.

**Add the alert with the feature.**

Instrumentation added after an incident is instrumentation that arrived one incident late.

**Make dashboards answer questions, not display data.**

A panel that has never informed a decision should be removed.

**Test redaction with real-shaped fixtures.**

The redaction test is the one that prevents a compliance incident.

**Sample aggressively, except where it matters.**

5% of successful reads. 100% of payments.

**Keep the release marker sacred.**

Every chart, every alert, every dashboard shows deploys.

---

# Performance Considerations

Telemetry that degrades the product it measures is a net negative.

| Concern                 | Budget          |
| ----------------------- | --------------- |
| Client telemetry bundle | < 15 KB gzipped |
| Log call overhead       | < 0.05 ms       |
| Metric increment        | < 0.01 ms       |
| Span creation           | < 0.1 ms        |
| Batch flush             | off main thread |
| Total client CPU        | < 0.5%          |

Techniques

**Batch and flush on idle.**

Client telemetry flushes via `requestIdleCallback`, on `visibilitychange`, and on a 10-second timer — never per event.

**Use `sendBeacon` for unload.**

Guarantees delivery of the final batch without delaying navigation.

**Bound every queue.**

Client queues cap at 100 events, dropping oldest with a counter. Telemetry must never cause an out-of-memory condition.

**Sample at the source.**

A dropped trace costs nothing. A transmitted-then-discarded trace costs bandwidth, CPU, and money.

**Never serialize large objects.**

Log node counts, never node trees. A schema in a log line is both a performance problem and a privacy problem.

**Lazy-load vendor SDKs.**

Sentry and PostHog load after first paint and are excluded from the critical path, protecting the bundle budgets in [performance.md](./performance.md).

**Degrade silently.**

If a telemetry endpoint is unreachable, drop the batch. Never retry aggressively, never surface an error, never block.

---

# Security Considerations

**Telemetry is a data-exfiltration surface.**

Anything logged leaves our trust boundary for a third-party processor. Every field is reviewed on that basis.

**Access control.**

```
Logs        engineering, audited access
Traces      engineering
Metrics     all staff (aggregate only)
Analytics   product + engineering
Audit logs  security + compliance, read-only, immutable
Replays     restricted, PII-masked, explicit justification required
```

**Client reports are untrusted.**

Browser-submitted telemetry is validated, size-capped, rate-limited per session, and never interpreted as instructions. It is data from a potentially hostile source.

**Security events are first-class telemetry.**

```
Failed authentication bursts
Permission escalation attempts
Invalid webhook signatures
Path traversal attempts on import
Rate limit violations
Anomalous data export volume
```

These route to a security alert channel, not the general engineering one.

**Never log an authorization decision's inputs.**

Log that access was denied and to what resource. Never log the token, the claims, or the policy evaluation.

**Sub-processors are documented.**

Sentry, PostHog, and the log sink each hold a DPA and appear in the public sub-processor list, per [security.md](./security.md).

---

# Testing Requirements

```
Correlation        one id spans client → API → worker → response
Redaction          no PII or secret in any sink, across full fixtures
Cardinality        forbidden labels rejected at compile time
Sampling           errors and payments always retained
Non-blocking       telemetry failure never surfaces or slows a request
Queue bounds       overflow drops oldest, increments counter, never OOMs
Health checks      degraded and unhealthy states produce correct codes
Alerts             every rule fires on a synthetic condition
SLO math           budget calculation verified against known inputs
Consent            opting out stops product analytics entirely
Erasure            a deletion request propagates to every sink
Vitals             values match a browser-measured baseline
```

Redaction and consent tests are release blockers, per [testing.md](./testing.md).

---

# Future Expansion

**OpenTelemetry end to end.**

The instrumentation layer already models spans and attributes on OTel semantics; adopting the wire protocol is a transport change.

**Continuous profiling.**

Always-on, low-overhead CPU and heap profiling in production, attributable to plugin and component.

**Anomaly detection.**

Learned baselines replacing static thresholds, reducing false pages during predictable traffic swings.

**Per-project observability for customers.**

Surfacing checkout performance, conversion, and error data to project owners as a product feature. All of it is already collected; only the presentation layer is missing.

**Synthetic monitoring.**

Scheduled end-to-end checkout transactions from multiple regions, catching failures before a customer does.

**Cost attribution.**

Per-tenant infrastructure cost derived from existing metrics, informing pricing.

**Replay-linked debugging.**

Session replay automatically attached to critical errors, PII-masked, with explicit consent.

**Collaboration telemetry.**

Presence, conflict, and merge metrics arriving with Phase 24.

---

# Success Criteria

The system is successful when:

- Any user-reported error can be located and explained from its correlation id alone, in under a minute.
- Every P1 alert reaches on-call within 60 seconds and has a runbook.
- No log, metric, trace, or analytics record has ever contained PII, a secret, or card data.
- Metric cardinality is bounded by construction, not by vigilance.
- Deploy markers appear on every chart, so "what changed" is answered before it is asked.
- Telemetry consumes under 0.5% of client CPU and never blocks an interaction.
- SLO budgets are reviewed weekly and mechanically gate feature work.
- We learn about incidents from monitoring, not from customers.
- A performance regression is caught in staging or in the post-deploy window, not in a support ticket.

---

# Philosophy

You cannot fix what you cannot see, and you cannot see what you did not instrument.

Observability is the difference between a team that responds to incidents and a team that is surprised by them. It is also, quietly, a product discipline: the same data that explains an outage explains why users abandon at the shipping step, which template converts, and which feature nobody uses.

But telemetry is a privilege extended by users who never explicitly agreed to be measured. The obligation that comes with it is absolute — collect the minimum that answers a real question, never collect what could harm someone if leaked, and never let the act of watching degrade the thing being watched.

Instrument everything that matters.

Store only what you can justify.

Alert only on what someone will act upon.
