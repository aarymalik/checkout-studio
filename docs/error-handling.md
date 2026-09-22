# Checkout Studio Error Handling Specification

**Version:** 1.0

**Status:** Failure & Resilience Architecture

---

# Purpose

Errors are not exceptional. In a production SaaS processing payments, they are a continuous background condition: networks drop, third parties time out, users paste malformed data, plugins throw, browsers run out of memory.

This document defines how Checkout Studio behaves when things go wrong.

It exists to guarantee that:

- The editor never crashes to a blank screen.
- No user work is ever lost to an error.
- A published checkout never fails to render because one component is broken.
- A payment is never silently lost, double-charged, or falsely confirmed.
- Every error message tells the user what happened and what to do next.
- Every error a user sees corresponds to a structured, correlated internal record.

Error handling is not a `try/catch` policy.

It is a product surface.

---

# Overview

Checkout Studio treats failure as a **typed, classified, recoverable event** that flows through a defined pipeline.

```
        Something fails
              │
              ▼
    ┌──────────────────┐
    │   Normalize      │   unknown → AppError
    └────────┬─────────┘
             ▼
    ┌──────────────────┐
    │   Classify       │   domain, severity, recoverability
    └────────┬─────────┘
             ▼
    ┌──────────────────┐
    │   Contain        │   boundary catches at the narrowest scope
    └────────┬─────────┘
             ▼
    ┌──────────────────┐
    │   Recover        │   retry, fallback, rollback, degrade
    └────────┬─────────┘
             ▼
    ┌──────────────────┐
    │   Communicate    │   toast, inline, panel, page
    └────────┬─────────┘
             ▼
    ┌──────────────────┐
    │   Report         │   structured log + correlated trace
    └──────────────────┘
```

No stage may be skipped.

An error that is caught but not classified will eventually be handled wrongly. An error that is handled but not reported will eventually recur unnoticed.

---

# Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  PRODUCERS                                                   │
│  editor · renderer · API · workers · webhooks · plugins      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  NORMALIZATION            packages/utils/src/errors           │
│  unknown → AppError                                          │
│  fromZod · fromPrisma · fromStripe · fromFetch               │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  CLASSIFICATION                                              │
│  domain × severity × recoverability                          │
│  determines behavior without per-site decisions              │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  CONTAINMENT  │  │   RECOVERY    │  │  REPORTING    │
│  boundary     │  │  retry ·      │  │  structured   │
│  hierarchy    │  │  rollback ·   │  │  log + trace  │
│  (UI)         │  │  degrade      │  │  + Sentry     │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        └──────────────────┼──────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  COMMUNICATION            packages/ui/src/errors              │
│  silent · status bar · inline · toast · panel · dialog · page │
└──────────────────────────────────────────────────────────────┘
```

The same `AppError` type crosses every boundary — browser, server, worker, and webhook — which is what allows one taxonomy to govern presentation, retry policy, alerting, and the API contract simultaneously.

---

# Design Principles

**Never lose work.**

Every other principle is subordinate to this one. When a choice exists between correctness and preserving the user's document, preserve the document and flag the inconsistency.

**Fail at the narrowest possible scope.**

One broken node fails that node. One broken panel fails that panel. Nothing propagates further than it must.

**Fail closed on money, open on pixels.**

A payment ambiguity halts and asks. A rendering ambiguity degrades and continues.

**Errors are values, not control flow.**

Expected failures are returned as typed results. Exceptions are reserved for genuinely unexpected conditions.

**Every error has an identity.**

A stable code, a domain, a severity, and a correlation id. "Something went wrong" is not an error — it is an absence of engineering.

**The user message and the log message are different artifacts.**

One is for a human trying to finish a task. The other is for an engineer at 3am.

**Never expose internals.**

Stack traces, SQL, file paths, and dependency names never reach a client, per [security.md](./security.md).

**Retry only what is safe to retry.**

Idempotency is a prerequisite for automatic retry, not an afterthought.

---

# Error Taxonomy

Every error in the system belongs to exactly one domain and one severity.

## Domains

```
validation     Input did not satisfy a contract
auth           Authentication or authorization failed
resource       An entity was absent, conflicting, or exhausted
schema         A checkout document is invalid or unmigratable
renderer       A component failed to resolve or render
editor         An editing operation failed
plugin         Third-party code failed
payment        Stripe or order processing failed
network        A request failed in transit
storage        Asset upload, download, or persistence failed
external       A non-Stripe third party failed
internal       An unexpected condition in our own code
```

## Severity

```
info        Expected, informational. No action needed.
warning     Degraded, but the task can continue.
error       The requested operation failed. The user must act or retry.
critical    Data integrity, payment, or security is at risk. Page or alert.
```

## Recoverability

```
retryable        Safe to retry automatically
user-retryable   Safe to retry, but requires a user decision
recoverable      Degraded path available
fatal            The current context cannot continue
```

The combination determines behavior without any per-site decision-making.

```
network + retryable        → silent retry with backoff
payment + user-retryable   → inline message, retry button, no auto-retry
schema  + fatal            → restore from history, report critical
renderer + recoverable     → fallback component, warning badge
```

---

# The AppError Type

A single error type flows through the entire stack.

```ts
export type ErrorDomain =
  | "validation"
  | "auth"
  | "resource"
  | "schema"
  | "renderer"
  | "editor"
  | "plugin"
  | "payment"
  | "network"
  | "storage"
  | "external"
  | "internal"

export type ErrorSeverity = "info" | "warning" | "error" | "critical"

export type ErrorRecoverability = "retryable" | "user-retryable" | "recoverable" | "fatal"

export interface AppError {
  /** Stable, documented, machine-readable. SCREAMING_SNAKE_CASE. */
  code: string

  domain: ErrorDomain
  severity: ErrorSeverity
  recoverability: ErrorRecoverability

  /** For engineers. Precise, technical, never shown to users. */
  message: string

  /** For users. Plain language, actionable, never technical. */
  userMessage: string

  /** What the user should do. Rendered as an action when possible. */
  remediation?: {
    label: string
    action?: "retry" | "reload" | "contact-support" | "navigate" | "undo"
    href?: string
  }

  /** Structured context. Never contains PII or secrets. */
  context: Record<string, string | number | boolean>

  /** Ties the client error, server log, and trace together. */
  correlationId: string

  /** Original error, retained server-side only. */
  cause?: unknown

  /** HTTP status when this crosses an API boundary. */
  status?: number

  timestamp: string
}
```

## Construction

Errors are never constructed ad hoc. They come from a catalog.

```ts
export const Errors = {
  schema: {
    invalid: (nodeIds: string[]) =>
      createError({
        code: "SCHEMA_INVALID",
        domain: "schema",
        severity: "error",
        recoverability: "recoverable",
        message: `Schema validation failed for ${nodeIds.length} node(s)`,
        userMessage: "Some components on this page couldn't be read.",
        remediation: { label: "Restore last good version", action: "undo" },
        context: { nodeCount: nodeIds.length },
      }),
  },

  payment: {
    declined: (declineCode: string) =>
      createError({
        code: "PAYMENT_DECLINED",
        domain: "payment",
        severity: "error",
        recoverability: "user-retryable",
        message: `Stripe declined the payment: ${declineCode}`,
        userMessage: "Your card was declined. Try another payment method.",
        remediation: { label: "Try again", action: "retry" },
        context: { declineCode },
      }),
  },
} as const
```

Centralizing construction is what makes the error code catalog complete, the user copy reviewable, and the translation table possible.

## Normalization

Anything thrown anywhere is normalized before it is handled.

```ts
export function normalizeError(thrown: unknown): AppError {
  if (isAppError(thrown)) return thrown
  if (isZodError(thrown)) return fromZodError(thrown)
  if (isPrismaError(thrown)) return fromPrismaError(thrown)
  if (isStripeError(thrown)) return fromStripeError(thrown)
  if (isFetchError(thrown)) return fromFetchError(thrown)
  return Errors.internal.unexpected(thrown)
}
```

`normalizeError` never throws. It is the one function in the system that must always return.

---

# Error Code Catalog

Codes are stable API. Renaming one is a breaking change.

## Validation

| Code                | Status | User Message                              |
| ------------------- | ------ | ----------------------------------------- |
| `VALIDATION_ERROR`  | 422    | Please check the highlighted fields.      |
| `INVALID_FILE_TYPE` | 422    | That file type isn't supported.           |
| `FILE_TOO_LARGE`    | 422    | That file is too large. Maximum is {max}. |

## Auth

| Code                | Status | User Message                         |
| ------------------- | ------ | ------------------------------------ |
| `UNAUTHORIZED`      | 401    | Please sign in to continue.          |
| `FORBIDDEN`         | 403    | You don't have access to this.       |
| `SESSION_EXPIRED`   | 401    | Your session expired. Sign in again. |
| `INSUFFICIENT_ROLE` | 403    | This action requires {role} access.  |

## Resource

| Code                 | Status | User Message                                   |
| -------------------- | ------ | ---------------------------------------------- |
| `PROJECT_NOT_FOUND`  | 404    | That project no longer exists.                 |
| `PAGE_NOT_FOUND`     | 404    | That page no longer exists.                    |
| `REVISION_NOT_FOUND` | 404    | That version no longer exists.                 |
| `ASSET_NOT_FOUND`    | 404    | That file is missing.                          |
| `CONFLICT`           | 409    | Someone else changed this. Reload to continue. |
| `QUOTA_EXCEEDED`     | 403    | You've reached your plan limit.                |
| `RATE_LIMITED`       | 429    | Too many requests. Try again in {seconds}s.    |

## Schema & Renderer

| Code                         | Severity | Behavior                 |
| ---------------------------- | -------- | ------------------------ |
| `SCHEMA_INVALID`             | error    | Restore from history     |
| `SCHEMA_MIGRATION_FAILED`    | critical | Block load, alert        |
| `SCHEMA_VERSION_UNSUPPORTED` | error    | Prompt to update         |
| `NODE_ORPHANED`              | warning  | Reparent to root, report |
| `NODE_CIRCULAR_REFERENCE`    | critical | Reject the mutation      |
| `COMPONENT_NOT_REGISTERED`   | warning  | Render fallback          |
| `COMPONENT_RENDER_FAILED`    | warning  | Render fallback          |
| `THEME_TOKEN_UNRESOLVED`     | info     | Use component default    |

## Editor

| Code                      | Severity | Behavior                             |
| ------------------------- | -------- | ------------------------------------ |
| `AUTOSAVE_FAILED`         | warning  | Queue, retry, warn on exit           |
| `HISTORY_CORRUPTED`       | critical | Rebuild from last persisted revision |
| `CLIPBOARD_UNAVAILABLE`   | info     | Fall back to internal clipboard      |
| `DROP_TARGET_INVALID`     | info     | Reject the drop, show why            |
| `OPERATION_NOT_PERMITTED` | info     | Explain (locked, wrong parent, etc.) |

## Payment

| Code                        | Severity | Recoverability |
| --------------------------- | -------- | -------------- |
| `STRIPE_NOT_CONNECTED`      | error    | user-retryable |
| `PAYMENT_INTENT_FAILED`     | error    | user-retryable |
| `PAYMENT_DECLINED`          | error    | user-retryable |
| `PAYMENT_REQUIRES_ACTION`   | info     | recoverable    |
| `PAYMENT_AMOUNT_MISMATCH`   | critical | fatal          |
| `WEBHOOK_SIGNATURE_INVALID` | critical | fatal          |
| `WEBHOOK_REPLAY_DETECTED`   | warning  | recoverable    |
| `ORDER_CREATION_FAILED`     | critical | retryable      |
| `REFUND_FAILED`             | error    | user-retryable |

## Plugin

| Code                       | Severity | Behavior                   |
| -------------------------- | -------- | -------------------------- |
| `PLUGIN_LOAD_FAILED`       | warning  | Disable plugin, continue   |
| `PLUGIN_INCOMPATIBLE`      | warning  | Disable plugin, notify     |
| `PLUGIN_RUNTIME_ERROR`     | warning  | Isolate, disable on repeat |
| `PLUGIN_PERMISSION_DENIED` | error    | Reject the call            |
| `PLUGIN_TIMEOUT`           | warning  | Abort the call, continue   |

## Infrastructure

| Code                  | Status | Recoverability |
| --------------------- | ------ | -------------- |
| `NETWORK_ERROR`       | —      | retryable      |
| `TIMEOUT`             | 504    | retryable      |
| `SERVICE_UNAVAILABLE` | 503    | retryable      |
| `DATABASE_ERROR`      | 500    | retryable      |
| `STORAGE_ERROR`       | 500    | retryable      |
| `INTERNAL_ERROR`      | 500    | user-retryable |

This catalog extends the error codes introduced in [api-spec.md](./api-spec.md).

---

# Containment: The Boundary Hierarchy

Containment is structural. Boundaries are placed so that the blast radius of any failure is bounded by design rather than by luck.

```
┌─────────────────────────────────────────────────────────┐
│ Application Boundary                                    │
│  Catches: catastrophic, unrecoverable                   │
│  Renders: full-page error with recovery actions         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Route Boundary                                    │  │
│  │  Catches: page-level failures                     │  │
│  │  Renders: route error, navigation intact          │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │ Studio Shell Boundary                       │  │  │
│  │  │  Catches: editor chrome failures            │  │  │
│  │  │  Preserves: document in memory, offers save │  │  │
│  │  │  ┌──────────┬──────────┬─────────────────┐  │  │  │
│  │  │  │ Panel    │ Canvas   │ Inspector       │  │  │  │
│  │  │  │ Boundary │ Boundary │ Boundary        │  │  │  │
│  │  │  │          │  ┌─────────────────────┐   │  │  │  │
│  │  │  │          │  │ Node Boundary       │   │  │  │  │
│  │  │  │          │  │  per rendered node  │   │  │  │  │
│  │  │  │          │  │  ┌───────────────┐  │   │  │  │  │
│  │  │  │          │  │  │ Plugin        │  │   │  │  │  │
│  │  │  │          │  │  │ Boundary      │  │   │  │  │  │
│  │  │  │          │  │  └───────────────┘  │   │  │  │  │
│  │  │  │          │  └─────────────────────┘   │  │  │  │
│  │  │  └──────────┴──────────┴─────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

Rules

- A boundary renders a **useful** fallback, never a blank region.
- A boundary reports before it renders. Reporting is never conditional on the fallback succeeding.
- A boundary offers a reset that re-mounts its subtree without reloading the page.
- A boundary that fails three times in 60 seconds stops retrying and escalates to its parent.

## Node Boundary

The most important boundary in the editor.

```
┌──────────────────────────────────────┐
│  ⚠  Button                           │
│                                      │
│  This component couldn't be          │
│  displayed.                          │
│                                      │
│  [ Reload component ]  [ Remove ]    │
└──────────────────────────────────────┘
```

Properties

- Occupies the node's computed dimensions, so layout does not collapse.
- Remains selectable, so the user can inspect, fix, or delete it.
- Keeps the node's data intact. The failure is in rendering, not in the document.
- Reports once per node per session, not once per re-render.

## Plugin Boundary

Per [plugin-api.md](./plugin-api.md), one plugin must never crash the editor.

```
Plugin throws

↓

Plugin boundary catches

↓

Error attributed to pluginId

↓

Failure count incremented

↓

3 failures in one session → plugin auto-disabled

↓

User notified with the plugin name and a re-enable action
```

Attribution matters. "The editor broke" and "the Coupon plugin broke" produce entirely different support outcomes.

---

# Recovery Strategies

## Retry with Backoff

For `retryable` errors only.

```ts
export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  jitter: boolean
  /** Only these codes are retried. */
  retryOn: string[]
  /** Never retried regardless of code. */
  neverRetry: string[]
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5_000,
  jitter: true,
  retryOn: ["NETWORK_ERROR", "TIMEOUT", "SERVICE_UNAVAILABLE", "DATABASE_ERROR"],
  neverRetry: ["VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "PAYMENT_DECLINED"],
}

/** Autosave never gives up while the tab is open; its queue is durable. */
export const autosaveRetryPolicy: RetryPolicy = {
  ...defaultRetryPolicy,
  maxAttempts: Number.POSITIVE_INFINITY,
  maxDelayMs: 30_000,
}
```

Delay is `min(base × 2^attempt, max)` with full jitter.

Rules

- Only idempotent operations retry automatically.
- Non-idempotent operations require an idempotency key before they may retry.
- A retried request carries the same correlation id, so the log shows one story rather than three.
- Retries are invisible to the user unless all attempts fail.

## Idempotency

Any operation that creates or charges carries a client-generated idempotency key.

```
Publish            key = pageId + revisionHash
Create order       key = paymentIntentId
Upload asset       key = contentHash
Import bundle      key = bundleChecksum + targetProjectId
Payment intent     key = "pi-create:" + checkoutSessionId  (cart changes update the intent; they never create one)
```

The server stores the key with its result for 24 hours. A repeat within that window returns the stored result rather than re-executing.

This is what makes retry safe, and it is what prevents a double-click from creating two orders.

## Optimistic Update with Rollback

Editor mutations apply locally first.

```
User action
    ↓
Apply to store optimistically
    ↓
Render immediately (< 16 ms)
    ↓
Persist in background
    ↓
    ├── success → confirm, clear pending flag
    │
    └── failure → classify
            ├── retryable      → queue, retry, keep local state
            ├── conflict       → surface merge choice
            └── fatal          → roll back, restore prior state, explain
```

Rollback restores the exact prior state from the history stack described in [state-management.md](./state-management.md).

The user sees the change revert with an explanation, never a silent divergence between what they see and what is stored.

## State Corruption Recovery

If the editor store fails a structural invariant, the document is rebuilt rather than repaired in place.

```
Invariant violated
   (orphan node, cycle, duplicate id, missing root)
        ↓
Freeze mutations
        ↓
Snapshot the corrupted state to diagnostics
        ↓
Walk back through history to the most recent valid state
        ↓
   found ──▶ restore, warn, resume editing
        ↓
   not found ──▶ reload the last persisted revision from the server
        ↓
   still invalid ──▶ open read-only recovery mode with export offered
```

The corrupted snapshot is always retained locally so the user can export it, even when it cannot be loaded.

We never delete a document we cannot read.

## Graceful Degradation

Some failures should reduce capability rather than stop work.

| Failure                      | Degraded behavior                                  |
| ---------------------------- | -------------------------------------------------- |
| Asset CDN unreachable        | Placeholder with retry, layout preserved           |
| Font failed to load          | Metric-matched fallback family                     |
| Analytics unavailable        | Silently dropped, never blocks                     |
| AI service unavailable       | Panel shows unavailable state, editor unaffected   |
| Template library unreachable | Cached templates only                              |
| Plugin failed                | Nodes render as `core.unsupported`, data preserved |
| Redis unavailable            | Fall through to the database, log a warning        |

Degradation is always visible somewhere — a badge, a status line, a panel state — never invisible.

---

# API Error Contract

Every API response uses the envelope from [api-spec.md](./api-spec.md).

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields.",
    "details": [
      {
        "path": "nodes.heading_a1b2.props.text",
        "code": "REQUIRED",
        "message": "Text is required."
      }
    ]
  },
  "meta": {
    "correlationId": "req_9f2ac71b",
    "timestamp": "2026-09-01T10:14:22.481Z"
  }
}
```

Rules

- `error.message` is the **user** message. Never the internal one.
- `details` appears only for `VALIDATION_ERROR` (schema paths, never database columns) and `QUOTA_EXCEEDED` (`{ limit, current, planId, suggestedPlan }`, which the upgrade prompt renders).
- `correlationId` is present on every response, success or failure, and is what a user quotes to support.
- Internal errors return a generic message and a correlation id. Nothing else.

## Server Handler Shape

```ts
export async function withErrorHandling<T>(
  handler: () => Promise<T>,
  ctx: RequestContext,
): Promise<ApiResponse<T>> {
  try {
    return success(await handler(), ctx)
  } catch (thrown) {
    const error = normalizeError(thrown)

    logger.error({
      code: error.code,
      domain: error.domain,
      severity: error.severity,
      message: error.message,
      correlationId: ctx.correlationId,
      userId: ctx.userId,
      projectId: ctx.projectId,
      route: ctx.route,
      durationMs: ctx.elapsed(),
    })

    if (error.severity === "critical") {
      reporter.capture(error, ctx)
    }

    return failure(error, ctx) // sanitized; cause is never serialized
  }
}
```

Every route handler and server action is wrapped. There are no unwrapped handlers.

---

# Renderer Error Handling

The published checkout has the strictest requirement in the product: **it must always render**.

A broken component costs one section. A blank page costs the whole sale.

```
Schema load
    ↓
Validate ──── invalid ──▶ Load last known good published revision
    ↓                     ─── none ──▶ Branded error page + support contact
Migrate  ──── failed ───▶ Same fallback chain
    ↓
Resolve components
    ↓
    ├── unknown type ──▶ core.unsupported (invisible in production)
    │
    └── resolved
            ↓
        Render inside a node boundary
            ↓
            ├── success
            └── throw ──▶ Fallback (invisible in production, visible in editor)
```

Production versus editor behavior differs deliberately.

| Situation         | Editor                             | Published                        |
| ----------------- | ---------------------------------- | -------------------------------- |
| Unknown component | Visible placeholder with type name | Renders nothing, logs            |
| Component throws  | Visible error card, selectable     | Renders nothing, logs            |
| Missing asset     | Placeholder with retry             | Empty box at reserved dimensions |
| Unresolved token  | Warning badge in inspector         | Component default                |

In the editor, the user needs to see the problem to fix it.

On a live checkout, the customer must never see our internals — but the layout must not shift either, so a failed node still occupies its reserved space to protect the CLS budget in [performance.md](./performance.md).

Critically: the **Payment Element never renders a fallback**. If payment cannot initialize, the checkout shows an explicit, branded "payment is temporarily unavailable" state with a support path. A checkout that looks functional but cannot take money is worse than one that says so.

---

# Payment Error Handling

The full payment architecture is defined in [stripe-integration.md](./stripe-integration.md).

Payment errors are the only category where we prefer stopping to guessing.

## Principles

**Never confirm from the client.**

The browser saying "payment succeeded" is a claim, not a fact. Orders are created from verified webhooks and server-side PaymentIntent retrieval, per [security.md](./security.md).

**Never retry a charge automatically.**

Every payment retry is a user decision.

**Amount mismatch is fatal.**

If the server-computed total differs from the PaymentIntent amount, the transaction halts and alerts. This is a `critical` error regardless of cause.

**Webhook failures retry; webhook forgery does not.**

An invalid signature is a security event, logged and dropped, never retried.

## Decline Mapping

Stripe decline codes map to user copy that helps rather than confuses.

| Stripe code               | User message                                                   |
| ------------------------- | -------------------------------------------------------------- |
| `insufficient_funds`      | Your card doesn't have enough funds. Try another card.         |
| `expired_card`            | That card has expired.                                         |
| `incorrect_cvc`           | The security code is incorrect.                                |
| `card_declined`           | Your card was declined. Contact your bank or try another card. |
| `processing_error`        | Something went wrong processing your card. Try again.          |
| `authentication_required` | Your bank needs to verify this payment.                        |

The raw decline code is logged. It is never shown.

## Order Creation Failure

The worst case in the system: the customer was charged, but our order write failed.

```
Payment succeeded (verified)
        ↓
Order write fails
        ↓
Classify: critical, retryable
        ↓
Enqueue durable retry (exponential, up to 24h)
        ↓
Alert on-call immediately
        ↓
Customer sees success — because they did succeed
        ↓
Reconciliation job compares Stripe charges against orders hourly
        ↓
Any orphan charge is surfaced for manual resolution
```

The customer is never told a successful payment failed.

The discrepancy is ours to resolve, and the reconciliation job guarantees it cannot be forgotten.

---

# Communication: How Errors Reach Users

The presentation is chosen by severity and context, not by the developer at the call site.

| Presentation    | When                             | Example                      |
| --------------- | -------------------------------- | ---------------------------- |
| **Silent**      | info, self-recovering            | Retry succeeded on attempt 2 |
| **Status bar**  | Background, non-blocking         | "Reconnecting…"              |
| **Inline**      | Tied to a specific field or node | "Text is required"           |
| **Toast**       | Action-scoped, transient         | "Couldn't duplicate section" |
| **Panel state** | A whole surface is unavailable   | AI panel offline             |
| **Dialog**      | Requires a decision              | Conflict resolution          |
| **Full page**   | Route or app cannot continue     | 500, 404                     |

## Message Rules

Every user-facing message answers three questions.

```
What happened?     "Your changes couldn't be saved."
Why?               "You're offline."
What now?          "We'll retry automatically. Don't close this tab."
```

Forbidden in user-facing copy

```
Error codes as the primary message
Stack traces
"Something went wrong" with no context
Blame ("You entered an invalid value")
Technical nouns (null, undefined, 500, exception, promise)
Apology theatre ("We're so incredibly sorry!")
```

Compare

```
✗  Error 403: Forbidden
✓  Stripe isn't connected yet. Connect it in Settings to accept payments.
   [ Open Settings ]

✗  TypeError: Cannot read property 'id' of undefined
✓  This component couldn't be displayed. Reloading usually fixes it.
   [ Reload component ]

✗  ECONNREFUSED
✓  We couldn't reach the server. Your work is saved locally and will
   sync when you're back online.
```

This is the standard already set in [ui-guidelines.md](./ui-guidelines.md).

## Toast Behavior

```
Duration          5s (error), 4s (warning), 3s (success)
Position          top-right
Stacking          maximum 3 visible, older collapse into a counter
Pause             on hover and on focus
Action            at most one, always the most likely next step
Persistence       critical toasts do not auto-dismiss
Deduplication     identical code within 3s increments a count
```

Deduplication matters: a failing autosave should produce one toast with a retry count, not forty toasts.

---

# Offline Handling

The editor must survive a lost connection without losing work.

```
Connection lost
      ↓
Status bar: "Offline — changes saved locally"
      ↓
Mutations continue against the local store
      ↓
Persistence queue accumulates in IndexedDB
      ↓
Publish, template install, and AI are disabled with explanation
      ↓
Connection restored
      ↓
Queue replays in order, with idempotency keys
      ↓
      ├── clean  → "All changes saved"
      └── conflict → conflict dialog
```

Rules

- The queue is durable across a tab close and a browser crash.
- A queued mutation older than 7 days prompts the user rather than replaying silently.
- Closing the tab with unsaved queued work triggers a `beforeunload` warning.
- The offline indicator is never a modal. Users can keep working.

---

# Conflict Handling

Two sessions editing the same page — the same user in two tabs or on two devices — is possible today. Session locks make it rare; they cannot make it impossible.

Detection is by `draftVersion`, never by timestamp or revision number.

```
Client last saved at draftVersion 14
Server draft is now at draftVersion 16
        ↓
PATCH /pages/{id}/draft { baseVersion: 14 } → 409 CONFLICT
        ↓
Server returns a diff summary
        ↓
Dialog:
   "This page was changed in another session."
   [ Keep my changes ]  [ Use their changes ]  [ Compare ]
```

The behavior of each button is defined once, in **Conflict Resolution** in [history-versioning.md](./history-versioning.md). In every case the side that is not kept is saved as a `recovery` revision first, so no option destroys work.

---

# Internal Structure

```
packages/utils/src/errors/
├── index.ts
├── AppError.ts            Type + type guards
├── createError.ts         Factory
├── catalog/
│   ├── validation.ts
│   ├── auth.ts
│   ├── resource.ts
│   ├── schema.ts
│   ├── renderer.ts
│   ├── editor.ts
│   ├── plugin.ts
│   ├── payment.ts
│   └── infrastructure.ts
├── normalize/
│   ├── index.ts
│   ├── fromZod.ts
│   ├── fromPrisma.ts
│   ├── fromStripe.ts
│   └── fromFetch.ts
├── retry.ts
├── idempotency.ts
└── messages/
    └── en.ts              User-facing copy, translation-ready

packages/ui/src/errors/                 STUDIO BOUNDARIES
├── ErrorBoundary.tsx      Configurable, scoped
├── AppErrorBoundary.tsx
├── RouteErrorBoundary.tsx
├── PanelErrorBoundary.tsx
├── ErrorFallback.tsx
├── ErrorState.tsx
└── OfflineIndicator.tsx

packages/renderer/src/fallback/         RENDER BOUNDARIES
├── NodeErrorBoundary.tsx  One per rendered node
├── PluginErrorBoundary.tsx
├── Unsupported.tsx        core.unsupported
└── modes.ts               editor-preview vs production fallback behavior

packages/api/src/errors/
├── withErrorHandling.ts
├── toApiResponse.ts
└── statusMap.ts
```

Separating the error **model** (`utils`) from its **presentation** (`ui`, `renderer`) and its **transport** (`api`) is what keeps the same taxonomy usable on the server, in the editor, and in the renderer.

Node and plugin boundaries live in the renderer, not in `ui`, because the renderer may not import `ui` — and because they must exist on the published page, where Studio UI never ships. The editor canvas gets them for free, since it renders through the renderer.

---

# Workflows

## Autosave fails while offline

```
⌘S or 5s debounce
    ↓
POST fails: NETWORK_ERROR (retryable)
    ↓
Status bar → "Offline — changes saved locally"
    ↓
Mutation queued in IndexedDB
    ↓
Retry with autosaveRetryPolicy: 300ms, 600ms, 1.2s … capped at 30s, unlimited attempts
    ↓
Connection returns
    ↓
Queue replays with idempotency keys
    ↓
Status bar → "All changes saved"
```

The user was never interrupted and never lost a keystroke.

## A plugin component throws mid-edit

```
Render throws inside checkout.coupon
    ↓
Node boundary catches
    ↓
Attributed to plugin "checkout-core"
    ↓
Error card renders at the node's dimensions
    ↓
Reported once, with pluginId and componentType
    ↓
Rest of the canvas unaffected; selection, history, autosave intact
    ↓
Third failure this session → plugin disabled, user notified
```

## A published checkout hits an invalid schema

```
Renderer loads published revision 22
    ↓
Validation fails
    ↓
Critical error reported, on-call alerted
    ↓
Fall back to revision 21 (last known good)
    ↓
Customer sees a working checkout
    ↓
Project owner notified: "Your published page fell back to a previous version"
```

Revenue is protected first. Diagnosis happens after.

## A customer's card is declined

```
stripe.confirmPayment → card_declined / insufficient_funds
    ↓
Mapped to user copy
    ↓
Inline message beneath the Payment Element
    ↓
Form state preserved entirely — nothing is cleared
    ↓
Focus moved to the payment field
    ↓
Announced to screen readers
    ↓
Logged with decline code, no PAN, no PII
    ↓
No automatic retry
```

---

# Best Practices

**Never swallow an error.**

```ts
try {
  risky()
} catch {} // forbidden
try {
  risky()
} catch (e) {
  log(e)
} // required
```

This is already a rule in [coding-standards.md](./coding-standards.md); it is enforced by lint.

**Catch at the boundary, not at the call site.**

Catching everywhere produces a codebase where nothing fails and nothing works.

**Return typed results for expected failures.**

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }
```

Reserve `throw` for the genuinely unexpected.

**Preserve the cause.**

Always attach the original error server-side. Never serialize it to a client.

**Write the user message before the code.**

If you cannot explain the failure to a user in one sentence, the error is not yet classified correctly.

**Make errors correlatable.**

Client error, server log, and trace must share one id or debugging becomes archaeology.

**Test the failure path.**

An untested error path is not a recovery strategy — it is a second bug waiting behind the first.

**Alert on rate, not on instance.**

One `PAYMENT_DECLINED` is business as usual. Fifty in a minute is an incident.

---

# Performance Considerations

| Operation                         | Target               |
| --------------------------------- | -------------------- |
| Error normalization               | < 1 ms               |
| Boundary catch → fallback painted | < 100 ms             |
| Toast appearance                  | < 50 ms              |
| Retry decision                    | < 1 ms               |
| Error report enqueue              | < 5 ms, always async |
| Recovery from corrupted state     | < 500 ms             |

Techniques

**Reporting never blocks.**

Error transmission is queued and flushed on idle or `visibilitychange`. A failing reporter must never slow the app, and must never itself throw.

**Deduplicate before reporting.**

Identical errors within a window collapse to one report with an occurrence count. A render loop must not generate ten thousand network requests.

**Cap the queue.**

The client error queue holds at most 50 entries. Overflow drops the oldest and increments a counter.

**No expensive context capture in hot paths.**

Node-level errors capture ids and types, never serialized subtrees.

**Boundaries are cheap.**

React error boundaries add negligible cost when nothing throws. Placing one per node is affordable and worth it.

**Break the retry storm.**

A circuit breaker opens after 5 consecutive failures against an endpoint, holds for 30 seconds, then half-opens with a single probe.

---

# Security Considerations

Error handling is a classic information-disclosure surface.

**Never leak internals.**

Stack traces, SQL, ORM messages, file paths, dependency names, and internal hostnames are stripped before any response leaves the server.

**Uniform auth failures.**

`UNAUTHORIZED` and `FORBIDDEN` must not reveal whether a resource exists. A project the user cannot access returns the same shape as one that does not exist.

**Never log secrets.**

Redaction runs on every log record, not at each call site.

```
Redacted: password, token, secret, apiKey, authorization,
          cookie, cardNumber, cvc, iban, ssn, clientSecret
Hashed:   email, phone, ip (when retention requires them)
```

**Errors are not an oracle.**

Validation errors report which field failed, never which value would have succeeded.

**Rate-limit error-generating endpoints.**

Otherwise error responses become a probing channel.

**Client-reported errors are untrusted.**

Error reports from browsers are validated, size-capped, and rate-limited per session. They are data, never instructions.

**Security failures are silent to the attacker, loud to us.**

Invalid webhook signatures, permission escalation attempts, and traversal attempts return a generic response and raise a `critical` internal alert.

---

# Monitoring Integration

Every `AppError` is a structured event. See [observability.md](./observability.md) for the pipeline.

```
severity: info      → metric only
severity: warning   → log + metric
severity: error     → log + metric + Sentry
severity: critical  → log + metric + Sentry + page on-call
```

Alert thresholds are defined in one place: the **Alerting** table in [observability.md](./observability.md). Keeping them in two documents is how they drift.

---

# Testing Requirements

Per [testing.md](./testing.md), error paths are tested as rigorously as success paths.

```
Normalization      every source type → correct AppError
Catalog            every code has both messages and a defined behavior
Boundaries         each boundary catches, reports, and offers reset
Node isolation     one throwing node leaves the canvas fully functional
Plugin isolation   a throwing plugin never breaks the editor
Retry              backoff, jitter, cap, non-retryable rejection
Idempotency        duplicate submission creates exactly one order
Rollback           failed persistence restores exact prior state
Corruption         orphans, cycles, duplicate ids, missing root
Offline            queue durability across reload, ordered replay
Conflict           every resolution path preserves both versions
Renderer fallback  invalid schema falls back to last good revision
Payment            decline, 3DS, amount mismatch, webhook replay
Redaction          no secret appears in any log for any fixture
Disclosure         no response contains a stack trace or SQL
```

Chaos testing runs weekly against staging: injected latency, forced 500s, killed Redis, revoked Stripe keys, corrupted schemas.

The editor must survive all of them without losing a document.

---

# Future Expansion

**Error budgets.**

Formal SLOs with budget burn driving release gating, layered on the metrics already emitted.

**Self-healing schemas.**

Automatic, reversible repair of common structural faults with an audit entry, rather than a history restore.

**Predictive warnings.**

Surfacing likely failures before publish — unreachable payment element, missing Stripe connection, unresolved assets.

**User-visible incident status.**

An in-product status surface fed by the same alerting pipeline.

**Session replay on critical errors.**

Privacy-preserving reconstruction of the interaction sequence preceding a critical failure.

**Collaborative conflict merge.**

Three-way merge replacing choose-one resolution, arriving with real-time collaboration in Phase 24.

**Localized error copy.**

The message catalog is already isolated in `messages/en.ts` for exactly this.

---

# Success Criteria

The system is successful when:

- No error can produce a blank screen anywhere in the product.
- No user has ever lost work to an error, including offline, crash, and conflict.
- Every user-facing message states what happened, why, and what to do next.
- Every error a user reports can be located in logs by correlation id in under a minute.
- One broken component never breaks a page; one broken plugin never breaks the editor.
- A published checkout renders even when its latest revision is invalid.
- A customer is never charged twice and never told a successful payment failed.
- No stack trace, SQL fragment, or internal path has ever reached a client.
- Critical errors page on-call within 60 seconds of occurring.

---

# Philosophy

Software quality is not measured by how it behaves when everything works.

Every product is excellent on the happy path. The difference between a tool people trust and a tool people tolerate is entirely in what happens the first time something breaks — whether the user loses an hour of work, whether they understand what happened, whether they know what to do, and whether they believe it will not happen again.

Errors are moments of maximum vulnerability for the user and maximum honesty for the product.

Handle them as if the user's business depends on it.

For a checkout builder, it does.
