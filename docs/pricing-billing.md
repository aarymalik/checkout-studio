# Checkout Studio Pricing & Billing Specification

**Version:** 1.0

**Status:** Commercial & Subscription Architecture

---

# Purpose

This document specifies how Checkout Studio charges its own customers.

It covers the plans we sell, the limits that distinguish them, how entitlements are enforced in code, how subscriptions are created and changed, what happens when payment fails, and how a customer leaves without losing their work.

It exists because billing is the one subsystem where a bug is simultaneously a revenue problem, a trust problem, and frequently a legal problem. A customer wrongly locked out of their checkout pages loses sales they will never recover, and they will remember it permanently.

This implements the billing portion of Phase 25 in [roadmap.md](./roadmap.md).

---

# Overview

Checkout Studio is a subscription SaaS with usage-based limits.

```
Free  →  Starter  →  Growth  →  Scale  →  Enterprise
```

The critical architectural distinction, restated from [stripe-integration.md](./stripe-integration.md) because it is constantly confused:

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│  STRIPE CONNECT                │   │  STRIPE BILLING                │
│  our users' payments           │   │  our own subscriptions         │
├────────────────────────────────┤   ├────────────────────────────────┤
│ Payer:   merchant's customer   │   │ Payer:   the merchant          │
│ Payee:   the merchant          │   │ Payee:   Checkout Studio       │
│ Account: connected account     │   │ Account: our platform account  │
│ Spec:    stripe-integration.md │   │ Spec:    this document         │
└────────────────────────────────┘   └────────────────────────────────┘
```

Two Stripe integrations, two entirely separate code paths, two separate sets of webhooks, two separate failure domains.

A billing outage must never stop a merchant from taking payments.

---

# Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  PLAN CATALOG                    versioned, grandfathered    │
│  free · starter · growth · scale · enterprise                │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  SUBSCRIPTION                    a projection of Stripe      │
│  planId · status · period · price version · overrides        │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  ENTITLEMENT RESOLVER            computed, never stored      │
│  plan → base · + enterprise overrides · + status restrictions│
│  cached 60s in Redis, invalidated by webhook                 │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
        ┌───────────────────┼───────────────────┐
        ▼                                       ▼
┌───────────────────┐                 ┌───────────────────┐
│   assertCan()     │                 │  USAGE METER      │
│   one enforcement │◀────────────────│  Redis counters   │
│   entry point     │   current usage │  flushed every 60s│
└─────────┬─────────┘                 └─────────┬─────────┘
          │                                     │
          ▼                                     ▼
   every billable action              thresholds → notices
                                      80% · 100% · 120%

                            ▲
                            │ state changes
              ┌─────────────┴─────────────┐
              │  STRIPE BILLING WEBHOOKS  │
              │  separate endpoint,       │
              │  separate secret,         │
              │  separate failure domain  │
              └───────────────────────────┘
                            ▲
                            │ nightly
              ┌─────────────┴─────────────┐
              │      RECONCILIATION       │
              │  Stripe is authoritative  │
              └───────────────────────────┘
```

Three properties define this design.

**Entitlements are derived, not stored.** Nothing caches a plan into a row, so a plan change is visible everywhere on the next request with no backfill.

**Enforcement flows through one function.** `assertCan` is the only place a limit is evaluated. Scattering checks through feature code is how a limit ends up enforced in four places and forgotten in the fifth.

**Billing is isolated from Connect.** Separate endpoints, secrets, handlers, and Stripe contexts, so a billing failure can never stop a merchant from taking payments.

---

# Design Principles

**Never hold work hostage.**

A lapsed subscription restricts _creating and publishing_. It never deletes projects, never disables an already-published checkout during the grace period, and never withholds an export.

**Published checkouts are the last thing to stop.**

A merchant's live revenue is the last thing we degrade, and only after ample warning. Their customers did nothing wrong.

**Entitlements are computed, never stored on the entity.**

A plan change takes effect everywhere immediately because nothing cached the old answer into a row.

**Limits are checked at the action, enforced on the server.**

The UI shows the limit. The server enforces it. A client that omits the check changes nothing.

**Fail open on read, closed on create.**

If the billing service is unreachable, existing work stays fully accessible. New billable actions are deferred, not silently allowed.

**Every billing state change is auditable.**

Who changed what plan, when, at what price, driven by which Stripe event.

**Prices are grandfathered.**

A customer who subscribed at a price keeps it until they change plans. Raising prices under existing customers is a choice we do not make silently.

**No dark patterns.**

Cancellation is self-service and takes the same number of clicks as subscribing.

---

# Plans

## Structure

|                             | Free   | Starter | Growth  | Scale      | Enterprise    |
| --------------------------- | ------ | ------- | ------- | ---------- | ------------- |
| **Monthly**                 | $0     | $29     | $79     | $199       | Custom        |
| **Annual (per mo)**         | $0     | $24     | $65     | $165       | Custom        |
| Projects                    | 1      | 3       | 10      | Unlimited  | Unlimited     |
| Published pages             | 1      | 10      | 50      | Unlimited  | Unlimited     |
| Monthly page views          | 1,000  | 25,000  | 200,000 | 1,000,000  | Custom        |
| Team seats                  | 1      | 1       | 3       | 10         | Unlimited     |
| Asset storage               | 100 MB | 2 GB    | 20 GB   | 100 GB     | Custom        |
| Custom domains              | —      | 1       | 5       | Unlimited  | Unlimited     |
| Restorable snapshot history | 7 days | 30 days | 90 days | 1 year     | Custom        |
| Templates                   | Basic  | All     | All     | All        | All + private |
| AI assistance               | 10/mo  | 100/mo  | 500/mo  | 2,000/mo   | Custom        |
| Remove branding             | —      | ✓       | ✓       | ✓          | ✓             |
| Analytics retention         | 7 days | 30 days | 1 year  | 2 years    | Custom        |
| Priority support            | —      | —       | ✓       | ✓          | Dedicated     |
| SSO / SAML                  | —      | —       | —       | —          | ✓             |
| Audit logs                  | —      | —       | —       | ✓          | ✓             |
| SLA                         | —      | —       | —       | 99.9%      | 99.95%        |
| Public API                  | —      | —       | Read    | Read/Write | Read/Write    |

Annual billing is discounted approximately 17% (two months free) and billed in one payment.

**Snapshot history** limits how far back a user can browse and restore manual snapshots and import revisions. It never applies to:

- Published revisions — retained permanently, per [history-versioning.md](./history-versioning.md)
- Any revision referenced by an order — required as dispute evidence, per [stripe-integration.md](./stripe-integration.md)
- Recovery revisions created by conflict resolution or restore — retained indefinitely on every plan, per [history-versioning.md](./history-versioning.md)

## What We Deliberately Do Not Charge For

**Transaction volume or revenue share.**

We take no percentage of our merchants' sales. This is a positioning decision as much as a pricing one: a builder that takes a cut of your revenue is a partner you eventually want to leave. The architecture supports application fees — see [stripe-integration.md](./stripe-integration.md) — and we choose not to use them.

**Test-mode usage.**

Development is free. Charging for a merchant's staging traffic punishes exactly the behavior we want.

**Failed page views.**

A view that errored is our problem, not billable usage.

## Free Plan

The Free plan is a permanent tier, not a trial. It exists so a merchant can build a real checkout, take a real payment, and decide whether the product is worth paying for — before paying.

Constraints

```
Checkout Studio branding on published pages
1,000 views/month, then the page shows a friendly limit notice
   (never a broken page, never a payment failure)
No custom domain
7-day snapshot history
```

Reaching the view limit on Free never breaks an in-flight checkout. A customer mid-payment completes their payment.

## Trials

```
14 days of Growth, no card required
Full feature access
Reminders at day 7, day 12, day 14
On expiry, downgrade to Free — never suspension
```

No card required is a deliberate friction and conversion trade. We accept lower trial-to-paid conversion in exchange for higher trial starts and no involuntary charges.

---

# Entitlements

Entitlements are the runtime expression of a plan. They are computed, never stored.

```ts
export interface Entitlements {
  planId: PlanId
  status: SubscriptionStatus

  limits: {
    projects: number | "unlimited"
    publishedPages: number | "unlimited"
    monthlyPageViews: number | "unlimited"
    seats: number | "unlimited"
    storageBytes: number | "unlimited"
    customDomains: number | "unlimited"
    revisionRetentionDays: number
    aiRequestsPerMonth: number | "unlimited"
    analyticsRetentionDays: number
  }

  features: {
    removeBranding: boolean
    prioritySupport: boolean
    sso: boolean
    auditLogs: boolean
    privateTemplates: boolean
    publicApi: "none" | "read" | "read-write"
  }

  /** Present during grace, dunning, or trial. */
  restrictions?: {
    reason: "trial-expired" | "payment-failed" | "canceled" | "limit-exceeded"
    canCreate: boolean
    canPublish: boolean
    canEdit: boolean
    /** Published pages keep serving until this moment. */
    publishedPagesActiveUntil?: string
  }
}

export type PlanId = "free" | "starter" | "growth" | "scale" | "enterprise"

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "paused"
  | "incomplete"
  | "incomplete_expired"
```

Every status Stripe can return is represented, because the table is a projection of Stripe's state. Their effect on entitlements:

```
trialing · active                → full plan entitlements
past_due                         → dunning restrictions by days since past_due
unpaid                           → treated as day 21 of dunning (Free plan limits)
paused                           → Free plan limits, nothing unpublished beyond them
incomplete                       → Free plan until the first payment completes
incomplete_expired · canceled    → Free plan
```

## Resolution

```
Request arrives
      ↓
Load subscription (cached in Redis, 60s, invalidated by webhook)
      ↓
Map plan → base entitlements
      ↓
Apply enterprise custom overrides
      ↓
Apply status restrictions (dunning, trial expiry, cancellation)
      ↓
Entitlements
```

Never stored on the User or Project row. A plan upgrade takes effect on the next request everywhere, with no backfill job and no stale rows.

## Enforcement

Two layers, and only one of them is trusted.

```
CLIENT   shows limits, disables actions, explains upgrades
         → user experience only

SERVER   checks before every billable action
         → the actual enforcement
```

```ts
export async function assertCan(action: BillableAction, ctx: TenantContext): Promise<void> {
  const ent = await getEntitlements(ctx)
  const check = evaluate(action, ent, await getUsage(ctx))

  if (!check.allowed) {
    throw Errors.resource.quotaExceeded({
      action,
      limit: check.limit,
      current: check.current,
      planId: ent.planId,
      suggestedPlan: check.suggestedPlan,
    })
  }
}
```

Every billable action calls it.

```
createProject      publishPage        addCustomDomain
uploadAsset        inviteSeat         requestAiGeneration
createTemplate     callPublicApi
```

The resulting error carries the limit, the current value, and the plan that would resolve it — so the UI can show a useful upgrade prompt rather than a dead end. This follows the error contract in [error-handling.md](./error-handling.md).

---

# Usage Metering

Two kinds of limits, metered differently.

```
RESOURCE LIMITS               USAGE LIMITS
counted at the moment         accumulated over a period
of the action                 and reset on the cycle boundary

projects                      monthly page views
published pages               AI requests
seats                         API calls
storage bytes
custom domains
```

## Page Views

The only high-volume metric, and the one most likely to be argued about.

```
Published checkout served
      ↓
Counted if: HTML was delivered
            not a known bot
            not a preview or draft
            not the merchant's own recent session
            not an error response
      ↓
Increment Redis counter: views:{projectId}:{YYYY-MM}
      ↓
Flush to the database every 60 seconds
      ↓
Threshold crossings emit events at 80%, 100%, 120%
```

Counted once per page load, not per asset, not per API call from the page.

Deliberately not counted

```
Bots and crawlers (UA + heuristics)
The merchant's own views within their session
Preview and draft views
Error responses
Health checks and uptime monitors
```

Being generous here is the correct trade. A merchant who believes they are being over-counted will not trust any number we show them, including their conversion rate.

## Overage Behavior

We do not bill overages automatically. Surprise invoices are the fastest way to lose a customer.

```
80%   in-app notice + email
100%  email + upgrade prompt
      published pages CONTINUE SERVING
120%  daily reminder
      published pages CONTINUE SERVING
150%  account manager contact (paid plans)
      published pages CONTINUE SERVING
```

On **Free** only, a soft limit applies past 100%: the page displays a limit notice rather than the checkout. An in-flight payment always completes.

On **paid** plans, published pages never stop serving because of an overage. We contact the customer. We do not silently break their revenue and then invoice them for the privilege.

---

# Subscription Lifecycle

```
              ┌──────────┐
              │   FREE   │◀──────────────────────┐
              └────┬─────┘                       │
                   │ start trial                 │ trial expires
                   ▼                             │ or cancels
              ┌──────────┐                       │
              │ TRIALING │───────────────────────┤
              └────┬─────┘                       │
                   │ subscribe                   │
                   ▼                             │
              ┌──────────┐   payment fails  ┌────┴─────┐
              │  ACTIVE  │─────────────────▶│ PAST_DUE │
              │          │◀─────────────────│ (dunning)│
              └────┬─────┘   recovered      └────┬─────┘
                   │                             │ 21 days elapsed
                   │ cancel                      ▼
                   ▼                        ┌──────────┐
              ┌──────────┐                  │ CANCELED │
              │ CANCELING│─────────────────▶│          │
              │(to cycle │  period ends     └──────────┘
              │  end)    │
              └──────────┘
```

## Subscribing

```
Choose a plan
      ↓
Stripe Checkout Session (hosted — we never build a card form)
      ↓
Customer pays on Stripe
      ↓
checkout.session.completed webhook
      ↓
Verify signature, dedupe, retrieve the session
      ↓
Create the subscription record
      ↓
Entitlements resolve to the new plan on the next request
      ↓
Welcome email
```

Stripe Checkout, not a custom form. Our own billing has the same PCI posture as our merchants' checkouts: card data never touches us.

## Upgrading

```
Immediate. Prorated by Stripe.
New entitlements apply on the next request.
Charged the prorated difference now.
```

Upgrades change the **existing** subscription with `subscriptions.update` and `proration_behavior: "always_invoice"`, through `POST /api/v1/billing/change-plan`.

They never go through Stripe Checkout. A subscription-mode Checkout Session always creates a _new_ subscription, so using one to upgrade would bill the customer twice. Checkout is used only for a customer's first subscription.

Upgrades are always instant, because a customer upgrading is usually blocked on something right now.

## Downgrading

```
Takes effect at the end of the current period, via a Stripe subscription schedule.
No proration, no credit, no refund: the customer keeps what they paid for until the period ends.
      ↓
If current usage exceeds the target plan's limits:
      ↓
Show exactly what must be resolved before the period ends
   "You have 14 published pages. Starter allows 10."
      ↓
At period end, if still over limit:
      ↓
Nothing is deleted.
Excess published pages are unpublished, newest first.
Excess projects become read-only.
The customer is emailed a precise list of what changed.
```

Nothing is ever deleted by a downgrade. Read-only and unpublished are both fully reversible by upgrading again.

## Canceling

```
Self-service. Two clicks. No retention interstitial, no phone call.
      ↓
Optional, skippable feedback question
      ↓
Access continues to the end of the paid period
      ↓
At period end → Free plan
      ↓
Over Free limits:
   Projects beyond 1        → read-only, retained
   Published pages beyond 1 → unpublished, retained
   Assets over quota        → retained, uploads blocked
      ↓
Data retained 12 months
Export always available, including on Free, including after cancellation
```

Export is never restricted by plan or by billing status. A customer's work is theirs, per [export-import.md](./export-import.md).

---

# Dunning

Failed payments are usually expired cards, not unwillingness to pay. The process assumes good faith.

```
Restrictions are keyed to **days since the subscription entered `past_due`**, never to retry attempts. Stripe Smart Retries chooses its own retry times, so attempt numbers cannot be scheduled. Smart Retries runs independently throughout; any successful retry ends dunning immediately.

```

Day 0 Payment fails → status past_due
Email: "Your payment didn't go through"
Full access retained
Published pages serving

Day 3 Email reminder
Full access retained

Day 7 In-app banner appears
Full access retained

Day 14 Publishing disabled
Editing retained
PUBLISHED PAGES STILL SERVING

Day 21 Email: "Final notice"
Subscription canceled → Free plan
Published pages beyond the Free limit unpublished
Nothing deleted

```

Stripe's own subscription settings are configured to leave the subscription `past_due` for the full 21 days, so our schedule, not Stripe's, decides when it ends.

Three weeks before a merchant's live checkout is affected, with escalating notice throughout.

The reasoning: a merchant whose card expired while they were on holiday should not return to find their business offline and their sales lost. The revenue we might protect by acting faster is smaller than the trust we would destroy.

Recovery at any point restores everything immediately, including republishing pages that were unpublished.

---

# Enterprise

Enterprise is a contract, not a checkout flow.

```

Custom pricing, annual or multi-year
Invoice billing, NET 30
Purchase orders
Custom limits, stored as explicit overrides
SSO / SAML
Contractual SLA (99.95%)
Dedicated support and named account manager
Security review, DPA, custom terms
Optional self-hosting or dedicated infrastructure

````

Custom entitlements are stored as an override object on the subscription and merged after the base plan resolves. The entitlement engine requires no special case for Enterprise — it is a plan with overrides.

---

# Data Model

Extending the entities in [database.md](./database.md).

```ts
export interface Subscription {
  id: string
  /** Owner. Becomes organizationId in Phase 22. */
  userId: string

  planId: PlanId
  status: SubscriptionStatus
  interval: "month" | "year"

  /** Stripe Billing, on OUR platform account. */
  stripeCustomerId: string
  stripeSubscriptionId: string | null
  stripePriceId: string | null

  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  trialEndsAt: string | null

  /** Grandfathered pricing. Minor units. */
  priceAmount: number
  priceCurrency: string
  /** The price version at signup. Never changed retroactively. */
  priceVersion: string

  /** Enterprise only. */
  customEntitlements: Partial<Entitlements> | null

  createdAt: string
  updatedAt: string
}

export interface UsageRecord {
  id: string
  subscriptionId: string
  projectId: string | null
  metric: UsageMetric
  /** YYYY-MM for monthly metrics. */
  period: string
  value: number
  updatedAt: string
}

export type UsageMetric =
  | "page_views" | "ai_requests" | "api_calls"
  | "storage_bytes" | "published_pages" | "projects" | "seats"

export interface BillingEvent {
  id: string
  subscriptionId: string
  type: BillingEventType
  /** Stripe event id, for idempotency. */
  stripeEventId: string | null
  fromPlan: PlanId | null
  toPlan: PlanId | null
  amount: number | null
  currency: string | null
  metadata: Record<string, string>
  createdAt: string
}

export type BillingEventType =
  | "trial_started" | "trial_ended"
  | "subscribed" | "upgraded" | "downgraded"
  | "payment_succeeded" | "payment_failed" | "payment_recovered"
  | "canceled" | "reactivated"
  | "limit_warning" | "limit_exceeded"
````

`BillingEvent` is append-only and permanent. It is the record that answers "why is this customer on this plan at this price", which is a question that will be asked during a support escalation, a refund dispute, and an audit.

---

# Billing Webhooks

A **separate endpoint** from the Connect webhooks in [stripe-integration.md](./stripe-integration.md).

```
apps/studio    /api/webhooks/stripe-billing   our subscriptions (platform account)
apps/renderer  /api/webhooks/stripe           merchant payments (connected accounts)
```

Separate endpoints, separate signing secrets, separate handlers, separate failure domains. A billing webhook bug must never be able to affect merchant payment processing.

| Event                                  | Action                         |
| -------------------------------------- | ------------------------------ |
| `checkout.session.completed`           | Create subscription, provision |
| `customer.subscription.created`        | Sync state                     |
| `customer.subscription.updated`        | Sync plan, status, period      |
| `customer.subscription.deleted`        | Downgrade to Free              |
| `customer.subscription.trial_will_end` | 3-day reminder                 |
| `invoice.paid`                         | Record payment, clear dunning  |
| `invoice.payment_failed`               | Enter dunning                  |
| `invoice.upcoming`                     | Renewal notice (annual only)   |
| `charge.dispute.created`               | Suspend, escalate to a human   |

Verification uses the identical pipeline as merchant webhooks — signature, timestamp, replay, dedupe, acknowledge, then process asynchronously.

## Stripe Is the Source of Truth

Our subscription table is a **projection** of Stripe's state, never an independent record.

```
Discrepancy between our state and Stripe's
      ↓
Stripe wins, always
      ↓
Reconcile, log, alert
```

A nightly reconciliation job compares every active subscription against Stripe and corrects drift. This mirrors the merchant-side reconciliation and exists for the same reason: verification prevents most divergence, but only reconciliation guarantees we notice the rest.

---

# Billing Portal

Self-service, powered by the Stripe Customer Portal for anything involving payment instruments.

```
Handled in our UI              Handled by Stripe Portal
─────────────────────          ────────────────────────
Plan comparison                Payment method updates
Current usage                  Invoice history and PDFs
Upgrade / downgrade            Billing address
Cancel                         Tax IDs
Usage alerts                   Receipts
```

We never build a card form. Not for our merchants, not for ourselves.

## Usage Display

```
┌──────────────────────────────────────────────────┐
│  Growth Plan                    $79/mo · renews  │
│                                     Oct 1, 2026  │
├──────────────────────────────────────────────────┤
│  Page views     ████████████░░░░░░  142k / 200k  │
│  Projects       ██████░░░░░░░░░░░░     4 / 10    │
│  Published      ████████░░░░░░░░░░    21 / 50    │
│  Storage        ███░░░░░░░░░░░░░░░  3.1 / 20 GB  │
│  AI requests    ██████████████░░░░   410 / 500   │
│  Seats          ██████████████████     3 / 3  ⚠  │
├──────────────────────────────────────────────────┤
│  [ Change plan ]        [ Manage billing ]       │
└──────────────────────────────────────────────────┘
```

Usage is visible before it becomes a problem, not after.

---

# Taxes & Compliance

```
Stripe Tax           automatic VAT, GST, and US sales tax
Reverse charge       EU B2B with a validated VAT number
Invoices             Stripe-generated, compliant per jurisdiction
Currency             USD primary; EUR and GBP presentment planned
Refunds              case-by-case within 30 days, at our discretion
Chargebacks          suspend, then escalate to a human — never automated
Records              7 years, per the audit retention in observability.md
```

Tax is Stripe's responsibility by design. Building tax logic for global VAT is a business we are not in.

---

# Internal Structure

```
packages/api/src/services/billing/
├── entitlements/
│   ├── resolve.ts             plan + status + overrides → Entitlements
│   ├── plans.ts               the plan catalog, versioned
│   ├── assertCan.ts           the single enforcement entry point
│   └── evaluate.ts
│
├── usage/
│   ├── meter.ts               Redis counters
│   ├── flush.ts               periodic persistence
│   ├── pageViews.ts           bot filtering, dedup
│   ├── thresholds.ts          80/100/120 events
│   └── reset.ts               cycle boundaries
│
├── subscriptions/
│   ├── create.ts
│   ├── change.ts              upgrade, downgrade, proration
│   ├── cancel.ts
│   ├── reactivate.ts
│   └── enforce.ts             downgrade consequences
│
├── dunning/
│   ├── schedule.ts
│   ├── notify.ts
│   └── restrict.ts
│
├── webhooks/
│   ├── verify.ts              same pipeline, separate secret
│   └── handlers/
│       ├── subscription.ts
│       ├── invoice.ts
│       └── dispute.ts
│
├── reconciliation/
│   └── job.ts                 nightly, Stripe is authoritative
│
├── portal.ts                  Stripe Customer Portal sessions
└── types.ts

apps/studio/src/app/(dashboard)/settings/billing/
├── page.tsx
├── PlanComparison.tsx
├── UsageMeters.tsx
├── ChangePlanDialog.tsx
└── CancelFlow.tsx

packages/ui/src/billing/
├── UpgradePrompt.tsx          shown when assertCan fails
├── UsageBar.tsx
└── LimitBanner.tsx
```

`assertCan` is the single enforcement entry point. Scattering limit checks through feature code is how a limit gets enforced in four places and forgotten in the fifth.

---

# API Surface

Per [api-spec.md](./api-spec.md).

```
GET    /api/v1/billing/subscription
GET    /api/v1/billing/entitlements
GET    /api/v1/billing/usage
GET    /api/v1/billing/plans

POST   /api/v1/billing/checkout-session      first subscription only
POST   /api/v1/billing/change-plan           upgrade (immediate, prorated) or downgrade (period end)
POST   /api/v1/billing/portal-session        Stripe Customer Portal
POST   /api/v1/billing/cancel
POST   /api/v1/billing/reactivate
POST   /api/v1/billing/trial

POST   /api/webhooks/stripe-billing        (unversioned, like every webhook)
```

Authorization

```
Owner            everything
Administrator    no access — excluded from billing,
                 per the role definitions in security.md
Editor           no access
Viewer           no access
```

---

# Workflows

## A merchant hits the published-page limit

```
Clicks Publish on their 11th page (Starter allows 10)
      ↓
assertCan("publishPage") fails
      ↓
QUOTA_EXCEEDED with details: limit, current, and suggestedPlan
      ↓
Upgrade prompt: "Starter includes 10 published pages.
                 Growth includes 50."
      ↓
Upgrade → prorated charge → entitlements resolve on next request
      ↓
Publish succeeds, same session, no reload
```

## A card expires

```
Day 0   invoice.payment_failed → past_due
        Email sent. Everything keeps working.
Day 7   Banner appears. Everything keeps working.
Day 12  Merchant updates their card in the Stripe portal
        invoice.paid → status active
        Banner clears, dunning canceled
```

Nothing was ever interrupted.

## A customer cancels and returns

```
Cancels → access to period end → Free plan
      ↓
3 projects: 1 active, 2 read-only
8 published pages: 1 serving, 7 unpublished
Nothing deleted. Export available throughout.
      ↓
Four months later, resubscribes to Growth
      ↓
All projects editable again
All pages republishable, at their last published revision
```

Reversibility is what makes cancellation safe to offer without a retention gauntlet.

## Traffic spike on a paid plan

```
Merchant's campaign goes viral, 200k → 340k views
      ↓
80%, 100%, 120% notices sent
      ↓
Published pages continue serving throughout — no interruption
      ↓
Account manager reaches out
      ↓
Upgrade to Scale, or a one-off allowance for the campaign
```

We do not break a merchant's best day of the year to enforce a limit.

---

# Best Practices

**Compute entitlements, never store them.**

A stored entitlement is a stale entitlement.

**One enforcement function.**

`assertCan`, everywhere. Never an inline plan comparison.

**Enforce on the server.**

The client shows the limit. The server means it.

**Fail open on read.**

If billing is unreachable, existing work stays accessible. Losing revenue on a new signup is recoverable. Locking a paying customer out of their live checkout is not.

**Warn before restricting.**

Every restriction is preceded by at least one notice the customer could act on.

**Never surprise-bill.**

No automatic overage charges. Contact the customer.

**Grandfather prices.**

Store the price version at signup and honor it.

**Make cancellation easy.**

A retention gauntlet converts a churned customer into someone who warns other people.

**Treat Stripe as authoritative.**

Our table is a projection. Reconcile nightly.

---

# Performance Considerations

| Operation                       | Target   |
| ------------------------------- | -------- |
| Entitlement resolution (cached) | < 5 ms   |
| Entitlement resolution (cold)   | < 40 ms  |
| `assertCan` check               | < 10 ms  |
| Usage increment                 | < 2 ms   |
| Usage dashboard load            | < 200 ms |
| Webhook verify + acknowledge    | < 50 ms  |

Techniques

**Cache entitlements in Redis**, 60-second TTL, invalidated by webhook. A plan change propagates immediately rather than waiting out the TTL.

**Meter in Redis, persist in batches.** Page-view counting is on the published-checkout hot path and must never add measurable latency. Counters increment in Redis and flush every 60 seconds.

**Never query Stripe in a request path.** All subscription state comes from our own projection.

**Never let metering block a render.** If Redis is unavailable, the view is served and the count is lost. An uncounted view costs us cents; a failed checkout costs the merchant a sale.

**Precompute the usage dashboard.** Aggregates are materialized, not computed per page load.

---

# Security Considerations

**We never build a card form.**

Stripe Checkout and the Customer Portal handle every payment instrument. Our own billing has the same PCI posture as our merchants' checkouts.

**Complete separation from Connect.**

Separate endpoints, secrets, handlers, and Stripe API contexts. A compromise or bug in billing cannot reach merchant payment processing, and vice versa.

**Entitlement checks are server-side, always.**

A client that skips the check accomplishes nothing.

**Ownership on every billing read and write.**

A user may only ever see their own subscription. Verified per entity, not per route.

**Administrators cannot access billing.**

Per [security.md](./security.md), Administrator is "everything except billing". Enforced at the authorization layer.

**Webhook verification is mandatory.**

Same pipeline as merchant webhooks. Signature, timestamp, replay protection, deduplication. Unbypassable in every environment.

**Never logged.**

```
Card details (never present)
Stripe customer secrets
Full billing addresses
Tax identifiers
```

Subscription events log plan, status, and amount only.

**Billing changes are audited.**

Every plan change, cancellation, and manual adjustment writes an immutable audit entry with the actor, the reason, and the driving Stripe event.

**Manual adjustments require two people.**

Comping a plan or overriding a limit requires a second approval and writes an audit entry naming both.

---

# Testing Requirements

Billing is a critical module requiring 100% coverage, per [testing.md](./testing.md).

```
Entitlements     every plan, every status, enterprise overrides,
                 restriction layering, cache invalidation
Enforcement      every billable action at, below, and above its limit
Metering         increment, bot filtering, dedup, flush, cycle reset,
                 threshold events, Redis unavailable
Lifecycle        subscribe, upgrade, downgrade, cancel, reactivate,
                 trial start and expiry
Proration        upgrade mid-cycle, downgrade mid-cycle
Downgrade        over-limit enforcement, nothing deleted, reversibility
Dunning          full 21-day timeline, recovery at each stage
Webhooks         signature, replay, duplicate, out-of-order, unknown customer
Reconciliation   drift in plan, status, and period; Stripe wins
Authorization    Administrator denied, Editor denied, cross-tenant denied
Failure          billing service down → reads succeed, creates deferred
Export           available on every plan and in every status
```

The "export always available" test is a release blocker. It is the technical guarantee behind the promise that we never hold work hostage.

---

# Future Expansion

**A/B testing.**

A planned Growth-tier feature, deliberately absent from the plan table until it is built. Plans never list a feature no phase delivers.

**Usage-based add-ons.**

Purchasing additional page views or AI credits without changing plan. The metering infrastructure already supports it.

**Annual prepay with rollover.**

Unused monthly allowance carrying forward within an annual term.

**Agency and multi-client billing.**

One subscription spanning many client projects with per-client reporting, arriving with Organizations in Phase 22.

**Marketplace revenue share.**

Template and plugin authors earning a share, paid via Connect. See [template-system.md](./template-system.md) and [plugin-api.md](./plugin-api.md).

**Regional pricing.**

Purchasing-power-adjusted pricing by country. The price-version model already supports multiple concurrent price sets.

**Application fees.**

The architecture supports taking a percentage of merchant transactions, per [stripe-integration.md](./stripe-integration.md). It remains a deliberate non-choice.

**Partner and reseller billing.**

Wholesale rates with a partner-managed customer relationship.

**Self-serve Enterprise.**

Automating the parts of Enterprise onboarding that do not genuinely require a human.

---

# Success Criteria

The billing system is successful when:

- No customer has ever been charged an amount they did not agree to.
- No customer has ever lost work because of a billing state.
- Export has been available on every plan, in every status, without exception.
- On a paid plan, a published checkout has never stopped serving without at least 14 days of prior notice. (On Free, pages beyond the monthly view limit show a notice — never a broken payment — after warnings at 80% and 100%.)
- Entitlements resolve in under 5 ms and reflect a plan change on the next request.
- Every limit is enforced server-side, through exactly one function.
- Our subscription state matches Stripe's, verified nightly.
- Cancellation takes no more clicks than subscribing.
- A customer who returns after cancelling finds everything exactly as they left it.
- No card form has ever existed in our codebase.

---

# Philosophy

Billing is where a product's stated values are tested against its revenue incentives.

Every dark pattern in SaaS billing exists because it works in the short term: the hidden cancellation flow, the surprise overage invoice, the data held hostage until you pay, the price raised quietly under existing customers. Each of them converts a small amount of extra revenue into a permanent reputational cost, paid by a customer who tells other people.

Our users are merchants. They understand billing intimately, because they do it to their own customers every day. They will notice exactly what we do here, and they will read it as a statement about what kind of company we are.

So the rules are simple. Warn before you restrict. Never break a live checkout without ample notice. Never delete anything. Always allow export. Make leaving as easy as arriving.

A customer should be able to cancel Checkout Studio on a Tuesday, get all of their work out, and still recommend us on Wednesday.

That is the only billing outcome worth optimizing for.
