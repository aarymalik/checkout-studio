# Checkout Studio Stripe Integration Specification

**Version:** 1.0

**Status:** Payment Architecture

---

# Purpose

This document specifies how Checkout Studio connects to Stripe, takes payments on behalf of its users, and records the results.

It is the highest-consequence subsystem in the product. Every other feature can degrade gracefully; this one cannot. A rendering bug costs a section. A payment bug costs a customer their revenue, their trust, and potentially their merchant account.

This document defines:

- How a user connects their own Stripe account, and why we never hold their secret key.
- How a payment moves from a rendered checkout to a recorded order.
- Why the browser is never believed about anything financial.
- How amounts are computed, verified, and reconciled.
- How webhooks are verified, deduplicated, and retried.
- What happens in every failure mode, including the one where the customer is charged and our database write fails.

It implements Phase 13 of [roadmap.md](./roadmap.md) and operates under the constraints in [security.md](./security.md).

---

# Overview

Checkout Studio is a **platform**. Our users are merchants. Their customers are the ones paying.

```
   Checkout Studio            Merchant              Customer
   (platform)                 (our user)            (their buyer)
        │                         │                      │
        │  hosts the checkout     │  owns the Stripe     │  pays
        │  never touches funds    │  account and funds   │
        └─────────────────────────┴──────────────────────┘
```

Money flows from the customer to the merchant's Stripe account.

It never passes through ours.

That single decision — **Stripe Connect with direct charges** — determines the rest of this architecture. It means we never hold a merchant's secret key, never custody funds, never become a money transmitter, and never appear in a chargeback dispute as the merchant of record.

## The Two Stripe Relationships

These are constantly confused, so they are separated here permanently.

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│  STRIPE CONNECT                │   │  STRIPE BILLING                │
│  (our users' payments)         │   │  (our own subscriptions)       │
├────────────────────────────────┤   ├────────────────────────────────┤
│ Who pays:  merchant's customer │   │ Who pays:  the merchant        │
│ Who gets:  the merchant        │   │ Who gets:  Checkout Studio     │
│ Account:   connected account   │   │ Account:   our platform account│
│ Spec:      this document       │   │ Spec:      pricing-billing.md  │
└────────────────────────────────┘   └────────────────────────────────┘
```

This document covers the left column only.

Our own subscription revenue is specified in [pricing-billing.md](./pricing-billing.md).

---

# Architecture

```
                        Customer's browser
                               │
                    ┌──────────┴──────────┐
                    │  Published checkout │
                    │  (apps/renderer)    │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
    ┌──────────────────┐            ┌───────────────────────┐
    │ Stripe Elements  │            │  Our checkout API     │
    │ (iframe, Stripe- │            │  (apps/renderer/api)  │
    │  hosted)         │            └───────────┬───────────┘
    │                  │                        │
    │ Card data never  │                        ▼
    │ enters our DOM   │            ┌───────────────────────┐
    └────────┬─────────┘            │  Pricing Engine       │
             │                      │  server-authoritative │
             │                      └───────────┬───────────┘
             │                                  ▼
             │                      ┌───────────────────────┐
             │                      │  PaymentIntent        │
             │                      │  created server-side  │
             │                      │  on the connected acct│
             │                      └───────────┬───────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            ▼
                    ┌───────────────┐
                    │    STRIPE     │
                    └───────┬───────┘
                            │ webhook (signed)
                            ▼
                  ┌───────────────────┐
                  │  Webhook Handler  │
                  │  verify → dedupe  │
                  │  → retrieve → act │
                  └─────────┬─────────┘
                            ▼
                  ┌───────────────────┐
                  │   Order created   │
                  │   (PostgreSQL)    │
                  └───────────────────┘
```

Two properties define the security posture:

**Card data never reaches us.** Stripe Elements renders in a Stripe-controlled iframe. Our JavaScript cannot read it, and neither can a malicious script injected into the merchant's page.

**Truth arrives by webhook, not by browser.** The browser reports what it believes happened. The webhook reports what Stripe knows happened. Orders are created from the second, never the first.

---

# Design Principles

**We never hold a merchant's secret key.**

Connect Standard means we act on the merchant's behalf via OAuth, using our own platform key plus a `Stripe-Account` header. A database breach exposes no merchant credentials, because we store none.

**The server owns the amount.**

The browser proposes a cart. The server computes the total. If they disagree, the server wins and the discrepancy is logged.

**The browser is never believed.**

Not about success, not about amount, not about which product, not about whether a coupon applied.

**Fail closed.**

When a payment outcome is ambiguous, we stop and ask. We never optimistically record a sale.

**Idempotency everywhere.**

Every create operation carries a key. A double-click, a retry, a duplicate webhook, and a network timeout all converge on exactly one charge and exactly one order.

**Webhooks are the source of truth, and they are untrusted until verified.**

Signature, timestamp, replay, and account ownership are all checked before a single byte is acted upon.

**Every charge reconciles.**

An hourly job compares Stripe's ledger against ours. A charge without an order is an incident, not a rounding error.

**The Payment Element never degrades silently.**

Every other component may render a fallback. This one shows an explicit unavailable state, because a checkout that looks functional but cannot take money is worse than one that says so.

---

# Connecting a Stripe Account

## Why Connect Standard

| Approach                         | Verdict                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merchant pastes their secret key | **Rejected.** We would custody credentials for thousands of merchants. One breach ends the company.                                                   |
| Connect Express                  | Rejected for v1. Stripe owns the merchant relationship and dashboard; our users are established businesses who already have Stripe accounts.          |
| **Connect Standard**             | **Chosen.** Merchant keeps their own account, dashboard, and support relationship. We never hold a key. Direct charges keep us out of the funds flow. |
| Connect Custom                   | Rejected. We would assume liability, onboarding, and compliance obligations.                                                                          |

Connect Standard with **direct charges** means the charge is created on the connected account. The merchant is the merchant of record. Funds settle to them. Disputes are theirs. Refunds come from their balance.

## OAuth Flow

```
Merchant clicks "Connect Stripe"
        ↓
Server generates a signed, single-use state token
   state = HMAC(projectId + userId + nonce + expiry)
   stored in Redis, TTL 10 minutes
        ↓
Redirect to Stripe OAuth
   https://connect.stripe.com/oauth/authorize
     ?response_type=code
     &client_id=ca_…
     &scope=read_write
     &state=<token>
        ↓
Merchant authorizes in Stripe
        ↓
Redirect back to /api/v1/stripe/connect/callback?code=…&state=…
        ↓
Verify state  ── invalid or expired ──▶ reject, log security event
        ↓
Exchange code for the connected account id
        ↓
Store stripeAccountId on the Project
   (an account id, not a key — it is not a secret)
        ↓
Fetch account capabilities
        ↓
Register payment method domains on the connected account
   (every hostname that will serve this project's checkouts)
        ↓
Mark the project as payment-ready
```

No per-account webhook is registered. Connect events for every connected account arrive at a **single platform-level Connect endpoint**, configured once in our Stripe dashboard, and each event carries `event.account` identifying the merchant.

## Payment Method Domains

Apple Pay and Google Pay only appear on domains registered for the account that owns the charge. With direct charges, that is the merchant's connected account — not ours.

```
Connect completes          → register the default checkout hostname
Custom domain verified     → register that hostname
Custom domain removed      → unregister it
Embed host registered      → register the merchant's host hostname
                             (Apple Pay in an iframe requires the top-level domain)
```

Registration uses the Payment Method Domains API with the `Stripe-Account` header. An unregistered domain does not fail loudly; wallet buttons simply never appear. The publish pre-flight check therefore verifies registration for the page's hostname.

The `state` token is not optional decoration. Without it, an attacker can connect _their_ Stripe account to _your_ project via CSRF, and every subsequent payment lands in their balance.

## What We Store

```ts
export interface StripeConnection {
  projectId: string

  /** acct_… — an identifier, not a credential. */
  stripeAccountId: string

  /** Mirrored from Stripe, refreshed on webhook and on demand. */
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean

  defaultCurrency: string
  country: string

  capabilities: {
    card_payments: CapabilityStatus
    transfers: CapabilityStatus
    link_payments?: CapabilityStatus
    afterpay_clearpay_payments?: CapabilityStatus
  }

  /** Anything Stripe still needs from the merchant. */
  requirements: {
    currentlyDue: string[]
    eventuallyDue: string[]
    pastDue: string[]
    disabledReason: string | null
  }

  connectedAt: string
  lastSyncedAt: string
}

export type CapabilityStatus = "active" | "pending" | "inactive"
```

Explicitly **not** stored, ever:

```
Secret keys              (we use our platform key + Stripe-Account header)
Restricted keys
Refresh tokens           (Connect Standard does not require them for direct charges)
Bank account details
Tax identifiers
Any customer card data
```

This satisfies the rule in [security.md](./security.md) that a merchant's payment credentials never enter our systems.

## Account Health

A merchant can connect successfully and still be unable to charge — pending verification, missing requirements, or a disabled account.

```
chargesEnabled = false
        ↓
Publishing a page containing a Payment Element is blocked
        ↓
Editor shows: "Stripe needs more information before you can accept payments."
        ↓
Deep link to the merchant's Stripe dashboard
```

`account.updated` webhooks keep this current. A merchant whose account is disabled mid-campaign is notified immediately rather than discovering it through failed payments.

## Disconnection

One Stripe account may back several projects — an agency or a merchant with several brands.

Disconnecting is therefore **project-local**:

```
Merchant disconnects a project
        ↓
That project's StripeConnection marked revoked
        ↓
That project's pages with a Payment Element are unpublished
        ↓
Existing orders retained (they are financial records)
        ↓
Any other project still using the account?
   yes → nothing more; the platform stays authorized
   no  → deauthorize the platform on the Stripe account
        ↓
Audit entry written
```

When the merchant revokes access from Stripe's side, `account.application.deauthorized` arrives, and **every** project using that account is disconnected the same way.

Disconnecting never deletes order history. Those records may be needed for tax, dispute, or legal purposes years later.

---

# Payment Flow

The complete sequence, with every trust boundary marked.

```
CUSTOMER                RENDERER              OUR SERVER            STRIPE
   │                       │                      │                   │
   │  loads checkout       │                      │                   │
   ├──────────────────────▶│                      │                   │
   │                       │  GET published rev   │                   │
   │                       ├─────────────────────▶│                   │
   │                       │◀─────────────────────┤                   │
   │◀──────────────────────┤  SSR html            │                   │
   │                       │                      │                   │
   │  fills the form       │                      │                   │
   │                       │                      │                   │
   │  (form change)        │  POST /quote         │                   │
   │                       ├─────────────────────▶│                   │
   │                       │                      │ compute total     │
   │                       │                      │ SERVER AUTHORITY  │
   │                       │◀─────────────────────┤                   │
   │◀──────────────────────┤  line items + total  │                   │
   │                       │                      │                   │
   │  clicks Pay           │                      │                   │
   ├──────────────────────▶│                      │                   │
   │                       │  POST /payment-intent│                   │
   │                       │  { quoteId, idemKey }│                   │
   │                       ├─────────────────────▶│                   │
   │                       │                      │ recompute total   │
   │                       │                      │ verify quote      │
   │                       │                      ├──────────────────▶│
   │                       │                      │  create PI        │
   │                       │                      │  on connected acct│
   │                       │                      │◀──────────────────┤
   │                       │◀─────────────────────┤  client_secret    │
   │                       │                      │                   │
   │  card data ───────────┼──────────────────────┼──────────────────▶│
   │  (never touches us)   │                      │   confirm         │
   │                       │                      │                   │
   │◀──────────────────────┼──────────────────────┼───────────────────┤
   │  3DS if required      │                      │                   │
   │                       │                      │                   │
   │                       │                      │◀──────────────────┤
   │                       │                      │  webhook (signed) │
   │                       │                      │  payment_intent.  │
   │                       │                      │  succeeded        │
   │                       │                      │                   │
   │                       │                      │ verify signature  │
   │                       │                      │ dedupe            │
   │                       │                      │ retrieve PI ──────▶
   │                       │                      │◀──────────────────┤
   │                       │                      │ verify amount     │
   │                       │                      │ CREATE ORDER      │
   │                       │                      │                   │
   │  redirect to success  │                      │                   │
   │◀──────────────────────┤                      │                   │
   │                       │  poll order status   │                   │
   │                       ├─────────────────────▶│                   │
   │◀──────────────────────┤  confirmed           │                   │
```

Note what the browser is never asked to do: compute a price, assert a success, or carry an amount that we then trust.

---

# The Pricing Engine

Every amount is computed on the server, from the published schema, every time.

```ts
export interface QuoteRequest {
  /** Which published page. */
  pageId: string
  /**
   * The revision the renderer actually served — normally the published
   * revision, or the fallback revision if the renderer fell back.
   * Pricing always runs against this exact revision.
   */
  revisionId: string
  /**
   * Omitted on the first quote. The server creates a CheckoutSession and
   * returns its id; the client sends it on every later request.
   */
  sessionId?: string

  /** Customer selections. Inputs, never amounts. */
  selections: {
    /** Node ids of chosen products and their quantities. */
    items: Array<{ nodeId: string; quantity: number }>
    /** Node ids of accepted order bumps. */
    bumps: string[]
    couponCode?: string
    shippingMethodId?: string
    address?: AddressInput
  }
}

export interface Quote {
  quoteId: string
  /** Signed so it cannot be tampered with between quote and intent. */
  signature: string
  expiresAt: string

  currency: string
  lineItems: QuoteLineItem[]

  subtotal: number // minor units, always integers
  discount: number
  shipping: number
  tax: number
  total: number

  /** Surfaced to the customer, never fatal. */
  notices: QuoteNotice[]
}

export interface QuoteLineItem {
  nodeId: string
  kind: "product" | "bump" | "shipping" | "discount" | "tax"
  label: string
  quantity: number
  unitAmount: number
  amount: number
}
```

Rules

**All amounts are integers in minor units.**

Cents, not dollars. Floating point never touches money. `19.99` becomes `1999`.

**Prices come from the published revision, never from the request.**

The client sends _which_ product. The server looks up _what it costs_. A client that sends a price is ignored; a client that sends a price differing from the schema is logged as a tampering attempt.

**Quotes are signed and short-lived.**

```
signature = HMAC(quoteId + sessionId + revisionId + total + currency + lineItemsHash, serverSecret)
expiry    = 15 minutes
```

**The quote is recomputed at intent creation.**

Not merely verified — recomputed from scratch. If the recomputed total differs from the signed quote, the request is rejected with `PAYMENT_AMOUNT_MISMATCH`, which is a `critical` error per [error-handling.md](./error-handling.md).

Verifying a signature proves the quote was not tampered with. Recomputing proves the price did not change underneath it — a coupon expiring, inventory running out, a merchant editing a price mid-session.

**Rounding is applied once, at the end, per currency.**

Zero-decimal currencies (JPY, KRW) and three-decimal currencies (BHD, KWD) are handled by currency metadata, not by assuming two decimals.

## Coupons

Coupons are Checkout Studio records (`Coupon` and `CouponRedemption` in [database.md](./database.md)), defined by the merchant in the dashboard.

Stripe coupon and promotion-code objects are **not** used. They apply only to Checkout Sessions, invoices, and subscriptions — never to a PaymentIntent — so Stripe could neither apply the discount nor count the redemption.

```
Code submitted
      ↓
Look up the project's Coupon (never client-side)
      ↓
Validate: exists · active · within date range
          · minimum order value · applicable products
          · held + redeemed < maxRedemptions
      ↓
Apply to the quote as a discount line item
      ↓
At intent creation: re-validate and HOLD a redemption
   (one transaction that counts held + redeemed rows)
      ↓
payment_intent.succeeded → redemption REDEEMED
payment canceled, or hold older than 30 min → RELEASED
```

A coupon is never marked redeemed by the browser. A customer who abandons after applying a coupon holds a redemption for at most 30 minutes, and never consumes one.

## Tax

```
v1        Merchant-configured flat or per-region rates, stored in the schema
Future    Stripe Tax for automatic calculation
```

Either way, tax is computed server-side and appears as a line item. The Tax Summary component displays what the server computed; it never calculates.

---

# Payment Intents

```ts
export interface CreatePaymentIntentRequest {
  quoteId: string
  quoteSignature: string
  sessionId: string
  customer: {
    email: string
    name?: string
    phone?: string
  }
}
```

Server-side creation, on the connected account:

```ts
const intent = await stripe.paymentIntents.create(
  {
    amount: quote.total, // server-computed, never client-supplied
    currency: quote.currency,
    automatic_payment_methods: { enabled: true },
    receipt_email: customer.email,
    metadata: {
      checkoutStudioPageId: page.id,
      checkoutStudioRevisionId: quote.revisionId, // the revision served, not the latest
      checkoutStudioQuoteId: quote.quoteId,
      checkoutStudioSessionId: sessionId,
    },
  },
  {
    stripeAccount: connection.stripeAccountId, // direct charge
    idempotencyKey: `pi-create:${sessionId}`, // one intent per checkout session
  },
)
```

The idempotency key is derived by the server from the checkout session, never sent by the client. There is exactly one PaymentIntent per session: a retry of the create returns the same intent, and a cart change goes through **update**, never a second create. Reusing a Stripe idempotency key with different parameters is an error, which is precisely why amount changes must never be expressed as a new create.

Rules

- `amount` is always the recomputed server total.
- `metadata` carries our identifiers so a Stripe dashboard row can always be traced back to a page and revision. This is invaluable during a dispute.
- `stripeAccount` makes it a direct charge on the merchant's account.
- `idempotencyKey` makes a retry safe.
- Only `client_secret` is returned to the browser. Never the full intent object.

## Amount Changes Mid-Session

If the customer changes their cart after an intent exists:

```
New quote computed
      ↓
Amount differs?
      ↓
Update the existing intent (same intent, new amount)
      ↓
Intent already confirmed or processing?
      ↓
Refuse the change, show the customer what happened
```

Updating rather than creating a second intent avoids a class of bug where two intents exist and both can be confirmed.

---

# Payment Element

The customer-facing component, specified in [component-library.md](./component-library.md).

```
Supported methods (automatic, based on the merchant's account and the customer)
  Cards
  Apple Pay
  Google Pay
  Link
  Bank debits and redirects, where enabled

Appearance
  Driven by the checkout theme, per theme-system.md
  Fonts, radius, colors, and spacing map to Stripe's Appearance API
```

## Theme Mapping

```ts
export function toStripeAppearance(theme: CheckoutTheme): Appearance {
  return {
    theme: "stripe",
    variables: {
      colorPrimary: theme.colors.primary,
      colorBackground: theme.colors.surface,
      colorText: theme.colors.foreground,
      colorDanger: theme.colors.danger,
      fontFamily: theme.typography.fontFamily.body.family,
      borderRadius: theme.radius.md,
      spacingUnit: `${theme.spacing.base / 2}px`,
    },
    rules: {
      ".Input": { borderColor: theme.colors.border },
      ".Input:focus": { boxShadow: `0 0 0 3px ${theme.colors.focusRing}` },
      ".Label": { color: theme.colors.foregroundMuted },
    },
  }
}
```

The Payment Element inherits the merchant's brand automatically. A merchant who changes their primary color sees it reflected inside the Stripe iframe without configuring anything.

## Loading

```
Stripe.js is loaded on interaction, not on page load
      ↓
Trigger: first focus on any form field, or 3 seconds after LCP,
         whichever comes first
      ↓
Skeleton renders in the Payment Element's reserved dimensions
      ↓
Element mounts
```

Deferred loading is what keeps the checkout's own bundle within budget. See **Performance Considerations** below.

## Never Falls Back

Per [error-handling.md](./error-handling.md), every component may render a fallback except this one.

```
Stripe.js failed to load
Connection unhealthy
chargesEnabled false
Intent creation failed
      ↓
Explicit branded state:
  "Payment is temporarily unavailable."
  "Please try again in a moment, or contact us."
      ↓
Merchant alerted
```

A silent fallback here produces a checkout that looks complete and cannot take money — the single worst failure mode in the product.

---

# Webhooks

Webhooks are how we learn what actually happened. They arrive from the public internet and are treated as hostile until proven otherwise.

## Verification Pipeline

```
Request arrives at /api/webhooks/stripe
        ↓
1. Read the RAW body
   Never a parsed body — signature is over exact bytes
        ↓
2. Verify the signature
   stripe.webhooks.constructEvent(rawBody, sig, secret)
   Failure → 400, log WEBHOOK_SIGNATURE_INVALID as a security event
        ↓
3. Verify the timestamp
   Older than 5 minutes → reject (replay protection)
        ↓
4. Verify account ownership
   event.account must map to a project we know
   Unknown account → 200 (acknowledge) but ignore and log
        ↓
5. Deduplicate
   event.id seen before? → 200, no-op
   Stored in Redis (24h) and in the database (permanent)
        ↓
6. Persist the event BEFORE processing
   Durable record survives a crash mid-handler
        ↓
7. Acknowledge immediately (200)
        ↓
8. Process asynchronously
```

Step 7 matters. Stripe expects a response within seconds. Doing the work before acknowledging causes Stripe to retry a request that is already succeeding, producing duplicate processing under load — exactly when you least want it.

Returning 200 for an unknown account (step 4) is deliberate: a non-2xx response would make Stripe retry, for up to 3 days, an event for an account we will never recognize.

## Handled Events

| Event                              | Action                                     |
| ---------------------------------- | ------------------------------------------ |
| `payment_intent.succeeded`         | Retrieve, verify amount, create order      |
| `payment_intent.payment_failed`    | Record attempt, no order                   |
| `payment_intent.requires_action`   | Record pending state                       |
| `payment_intent.canceled`          | Mark abandoned                             |
| `charge.refunded`                  | Update order, record refund                |
| `charge.dispute.created`           | Flag order, alert merchant                 |
| `charge.dispute.closed`            | Update dispute outcome                     |
| `account.updated`                  | Refresh capabilities and requirements      |
| `account.application.deauthorized` | Revoke connection, unpublish payment pages |

## Order Creation

```
payment_intent.succeeded received and verified
        ↓
RETRIEVE the intent from Stripe
   Never trust the webhook payload's amount — retrieve it
        ↓
Verify: status = succeeded
        amount_received = expected total
        currency matches
        metadata identifies a page and revision we published
        ↓
Any mismatch → PAYMENT_AMOUNT_MISMATCH, critical, halt, alert
        ↓
Idempotent order creation, keyed on paymentIntentId
   Unique constraint in the database, not just an application check
        ↓
Within one transaction:
   • create Order
   • create OrderItems
   • mark coupon redeemed
   • decrement inventory, if tracked
   • record the customer
        ↓
Post-commit:
   • confirmation email
   • merchant notification
   • analytics event
```

The uniqueness constraint on `stripePaymentIntentId` is the last line of defense. Application-level idempotency can lose a race; a database constraint cannot.

## Retry & Backlog

```
Stripe retries a failed webhook for up to 3 days with backoff.

Our processing failures are queued durably and retried
independently, so a transient database error does not
depend on Stripe retrying.

webhook_lag_ms is monitored. p95 above 60s for 10 minutes
pages on-call, per observability.md.
```

Webhook lag rises before anything else visibly breaks. It is one of the highest-value signals in the system.

---

# Reconciliation

Idempotency and verification reduce the chance of divergence. Reconciliation guarantees we notice it.

```
Hourly job
      ↓
For each connected account with activity in the window:
   List Stripe charges (succeeded) for the period
   List our orders for the period
      ↓
   Charge without an order   → ORPHAN CHARGE, critical alert
   Order without a charge    → PHANTOM ORDER, critical alert
   Amount mismatch           → critical alert
   Refund not reflected      → warning, auto-correct
      ↓
Discrepancies written to a reconciliation report
      ↓
Any orphan charge pages on-call
```

An orphan charge means a customer paid and we have no record. That is the scenario the entire architecture exists to prevent, and the reconciliation job exists to catch the cases where prevention failed.

---

# Failure Modes

Every one of these is specified because every one of these will happen.

| Failure                                     | Behavior                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Card declined                               | Inline message from the decline map, form state preserved, focus moved, no auto-retry         |
| 3D Secure required                          | Stripe handles the challenge; we record `requires_action` and wait for the webhook            |
| Customer closes the tab mid-payment         | Webhook still arrives; order still created; confirmation email still sent                     |
| Network drops before confirmation           | Idempotency key means retry confirms the same intent, never a second one                      |
| Double-click on Pay                         | Button disables on first click; idempotency key makes the second request a no-op              |
| Webhook never arrives                       | Reconciliation catches it within the hour                                                     |
| Webhook arrives twice                       | Deduplicated by `event.id`                                                                    |
| Order write fails after a successful charge | Durable retry up to 24h + immediate page; customer still sees success, because they succeeded |
| Merchant edits the price mid-session        | Recompute at intent creation catches it; customer sees the updated total                      |
| Coupon expires mid-session                  | Recompute catches it; customer is told before paying                                          |
| Merchant disconnects Stripe mid-session     | Intent creation fails with `STRIPE_NOT_CONNECTED`; explicit unavailable state                 |
| Stripe outage                               | Payment Element shows unavailable; merchant alerted; no false success                         |
| Amount tampering attempt                    | Rejected, logged as a security event, session flagged                                         |

## Decline Mapping

Raw decline codes are logged, never displayed. The mapping is defined in [error-handling.md](./error-handling.md) and shared with this document.

```
insufficient_funds       → "Your card doesn't have enough funds. Try another card."
expired_card             → "That card has expired."
incorrect_cvc            → "The security code is incorrect."
card_declined            → "Your card was declined. Contact your bank or try another card."
processing_error         → "Something went wrong processing your card. Try again."
authentication_required  → "Your bank needs to verify this payment."
```

---

# Refunds

Initiated by the merchant from the orders dashboard.

```
POST /api/v1/orders/{id}/refund
   { amount?: number, reason?: string }
        ↓
Authorize: Owner or Administrator on the owning project
        ↓
Verify the order belongs to this project
        ↓
Amount omitted → full refund
Amount present → validate ≤ (total − alreadyRefunded)
        ↓
stripe.refunds.create({ payment_intent }, { stripeAccount, idempotencyKey })
        ↓
Order marked refund_pending
        ↓
charge.refunded webhook → order updated to refunded / partially_refunded
        ↓
Audit entry written
```

Rules

- Refunds come from the merchant's balance. We never advance funds.
- Partial refunds are supported and accumulate.
- Over-refunding is impossible; the sum is validated server-side.
- The order status is updated by webhook, not by the API response — the same trust rule as payment.

---

# Disputes

```
charge.dispute.created
        ↓
Order flagged as disputed
        ↓
Merchant notified immediately (email + in-app)
        ↓
Evidence package assembled automatically:
   • the published revision as rendered at purchase time
   • the customer's submitted form data
   • timestamps, IP, user agent
   • the exact terms and refund policy shown
        ↓
Merchant submits evidence via their own Stripe dashboard
        ↓
charge.dispute.closed → outcome recorded
```

Because published revisions are immutable per [history-versioning.md](./history-versioning.md), we can prove exactly what a customer saw at the moment of purchase. That is frequently the deciding evidence in a dispute, and it is a direct benefit of the revision architecture.

---

# Internal Structure

```
packages/api/src/services/stripe/
├── connect/
│   ├── oauth.ts               authorize URL, state token, callback
│   ├── connection.ts          store, sync, revoke
│   └── health.ts              capabilities and requirements
│
├── pricing/
│   ├── quote.ts               server-authoritative computation
│   ├── sign.ts                HMAC signing and verification
│   ├── coupons.ts
│   ├── shipping.ts
│   ├── tax.ts
│   └── currency.ts            minor units, zero/three-decimal handling
│
├── intents/
│   ├── create.ts
│   ├── update.ts
│   └── retrieve.ts
│
├── webhooks/
│   ├── verify.ts              signature, timestamp, account, dedupe
│   ├── persist.ts             durable event record
│   ├── dispatch.ts
│   └── handlers/
│       ├── paymentIntent.ts
│       ├── charge.ts
│       ├── dispute.ts
│       └── account.ts
│
├── orders/
│   ├── create.ts              idempotent, transactional
│   ├── refund.ts
│   └── status.ts
│
├── reconciliation/
│   ├── job.ts                 hourly
│   └── report.ts
│
├── client.ts                  configured Stripe SDK, platform key only
├── errors.ts                  Stripe error → AppError mapping
└── types.ts

apps/renderer/src/
├── app/api/
│   ├── checkout/
│   │   ├── quote/route.ts
│   │   ├── payment-intent/route.ts
│   │   └── status/route.ts
│   └── webhooks/stripe/route.ts     raw body, no body parser
└── checkout/
    ├── StripeProvider.tsx
    ├── useDeferredStripe.ts         interaction-triggered loading
    └── appearance.ts                theme → Stripe Appearance

plugins/checkout/src/components/
├── payment-element/
├── express-checkout/
├── order-summary/
├── coupon/
├── order-bump/
├── shipping-selector/
└── tax-summary/
```

The pricing engine lives in `packages/api`, never in the renderer. The renderer displays prices; it never computes them.

---

# API Surface

Following the envelope in [api-spec.md](./api-spec.md).

```
Merchant-facing (authenticated)
POST   /api/v1/stripe/connect/authorize
GET    /api/v1/stripe/connect/callback
POST   /api/v1/stripe/connect/disconnect
GET    /api/v1/stripe/connect/status
GET    /api/v1/orders
GET    /api/v1/orders/{id}
POST   /api/v1/orders/{id}/refund

Customer-facing (public, rate limited, on apps/renderer)
POST   /api/checkout/quote
POST   /api/checkout/payment-intent
GET    /api/checkout/status/{sessionId}
POST   /api/webhooks/stripe
```

The customer-facing endpoints live on the renderer app and are deliberately minimal. They are the most exposed surface in the product.

Rate limits

```
/checkout/quote            30 / minute / session
/checkout/payment-intent   10 / minute / session,  5 / minute / IP
/checkout/status           60 / minute / session
/webhooks/stripe           unlimited (signature-gated)
```

---

# Workflows

## Merchant connects and takes a first payment

```
Settings → Connect Stripe → OAuth → authorized
        ↓
chargesEnabled true, capabilities active
        ↓
Editor: drag a Payment Element onto the page
        ↓
Validation passes (Stripe connected, product configured, currency set)
        ↓
Publish
        ↓
Customer visits, fills the form, pays
        ↓
Webhook verified → order created
        ↓
Merchant sees the order within seconds
```

## A charge succeeds but our write fails

```
payment_intent.succeeded verified
        ↓
Order transaction fails (database unavailable)
        ↓
Classified: ORDER_CREATION_FAILED, critical, retryable
        ↓
Enqueued for durable retry, exponential, up to 24h
        ↓
On-call paged immediately
        ↓
Customer sees success — because they did succeed
        ↓
Retry succeeds → order created, confirmation sent
        ↓
Had it not, hourly reconciliation would surface the orphan charge
```

The customer is never told a successful payment failed. The discrepancy is ours to resolve.

## Testing locally

```
stripe login
stripe listen --forward-to localhost:3001/api/webhooks/stripe

Test cards
  4242 4242 4242 4242   success
  4000 0000 0000 9995   insufficient funds
  4000 0027 6000 3184   requires 3D Secure
  4000 0000 0000 0002   generic decline

stripe trigger charge.dispute.created --stripe-account acct_…
```

`stripe trigger` creates fresh objects without our metadata, so it cannot exercise order creation — step 4 of the verification pipeline correctly ignores them. Use it only to smoke-test handler routing. Order creation is tested by completing a real test-mode payment through a checkout, which produces events carrying the correct account and metadata.

Signature verification stays enabled locally. Testing against a bypassed verifier leaves the production path untested — see [contributing.md](./contributing.md).

---

# Best Practices

**Never let an amount originate in the browser.**

Not in a hidden field, not in a signed token the client can swap, not "just for display".

**Retrieve, do not trust the payload.**

A webhook tells you an event occurred. Retrieving the object tells you what is true now.

**Use a database constraint for order uniqueness.**

Application-level idempotency loses races. `UNIQUE(stripePaymentIntentId)` does not.

**Acknowledge webhooks before processing.**

Otherwise Stripe's retries compound your load exactly when you are struggling.

**Put your identifiers in Stripe metadata.**

During a dispute at 2am, a Stripe dashboard row that names the page and revision is worth an hour of investigation.

**Never auto-retry a charge.**

Every payment retry is a customer decision.

**Test the failure paths.**

The success path gets exercised constantly. The orphan-charge path gets exercised once, in production, at the worst possible time — unless it is tested.

**Log decline codes, show decline messages.**

The customer needs help. The engineer needs the code. They are different artifacts.

---

# Performance Considerations

| Operation                    | Target            | Maximum |
| ---------------------------- | ----------------- | ------- |
| Quote computation            | < 80 ms           | 200 ms  |
| Payment intent creation      | < 400 ms          | 1 s     |
| Webhook verify + acknowledge | < 50 ms           | 200 ms  |
| Order creation transaction   | < 150 ms          | 500 ms  |
| Checkout status poll         | < 60 ms           | 200 ms  |
| Stripe.js load (deferred)    | off critical path | —       |

## Bundle Budget

Stripe.js is approximately 100–130 KB gzipped, which would consume most of the 150 KB published-checkout budget in [performance.md](./performance.md) on its own.

The budget is therefore scoped explicitly:

```
The 150 KB published budget covers FIRST-PARTY renderer JavaScript.

Stripe.js is a third-party, deferred, interaction-triggered dependency
and is measured and budgeted separately.

Stripe.js budget:  loaded only on a page containing a Payment Element,
                   never on the critical path,
                   never blocking LCP.
```

This is enforced in CI by measuring the first-party bundle with third-party scripts excluded from the budget calculation and reported as a separate line.

Deferring Stripe.js protects LCP and FCP. The Payment Element occupies reserved dimensions from first paint, so deferring it costs nothing in CLS.

## Other Techniques

**Cache the connection.** Account status is cached in Redis for 60 seconds; `account.updated` invalidates it.

**Debounce quotes.** Form changes debounce at 300 ms rather than quoting per keystroke.

**Process webhooks asynchronously.** Acknowledge in under 50 ms, process on a queue.

**Never poll Stripe in a request path.** Status comes from our own database, populated by webhooks.

---

# Security Considerations

This section restates and extends [security.md](./security.md) for the payment path specifically.

**PCI scope is minimized by construction.**

Card data enters a Stripe-hosted iframe and never touches our DOM, our servers, or our logs. That is what keeps our merchants eligible for SAQ A, the lightest PCI self-assessment. Any change that would put card data in our page — a custom card form, a "convenience" field — is a hard architectural violation.

Iframes alone are not sufficient under PCI DSS v4. The page that _embeds_ the payment iframe must also be protected against script-based attacks, because a malicious script on the parent page can overlay or imitate the payment form. Because we host that page on our merchants' behalf, that obligation falls on us. It is met by the script policy in [security.md](./security.md): no merchant JavaScript, an allowlisted set of tracking integrations, a CSP enumerating every script origin, and third-party widgets confined to sandboxed iframes.

**We hold no merchant credentials.**

Connect Standard means we store an account id, not a key. A full database compromise exposes no ability to charge on any merchant's behalf.

**Webhook signature verification is mandatory and unbypassable.**

There is no configuration flag that disables it, in any environment.

**Replay protection.**

Timestamp tolerance of 5 minutes plus permanent event-id deduplication.

**CSRF on OAuth.**

Signed, single-use, expiring state tokens. Without this, account hijacking is trivial.

**Amount integrity.**

Server computation, signed quotes, and recomputation at intent creation. Any mismatch is `critical` and halts the transaction.

**No secrets in the client bundle.**

The publishable key is public by design. The platform secret key exists only in server code, per the rule in [monorepo-structure.md](./monorepo-structure.md) that packages never read environment variables.

**Never logged.**

```
Card numbers, CVV, expiry     (never present to begin with)
client_secret
Platform or connected keys
Webhook signing secrets
Full customer PII in payment logs
```

Customer email is hashed in telemetry per [observability.md](./observability.md).

**Rate limiting on public endpoints.**

Intent creation is the most abusable endpoint in the product — an attacker can use it for card testing. Limits are per session and per IP, with anomaly alerting on failure-rate spikes.

**Security events.**

```
Invalid webhook signature bursts
Amount tampering attempts
OAuth state mismatches
Unusual decline patterns (card testing)
```

These route to the security alert channel, not the general engineering one.

---

# Testing Requirements

Per [testing.md](./testing.md), the Stripe service requires 100% coverage.

```
Connect          OAuth happy path, state mismatch, expired state,
                 denied authorization, disconnect, capability changes
Pricing          every currency class, rounding, coupon rules,
                 tampering rejection, quote expiry, recomputation drift
Intents          creation, update, idempotency, amount mismatch
Payment          success, decline (each code), 3DS, cancellation
Webhooks         valid signature, invalid signature, replay,
                 unknown account, duplicate event, out-of-order delivery
Orders           idempotent creation, unique constraint race,
                 transactional rollback, post-commit side effects
Refunds          full, partial, over-refund rejection, webhook update
Disputes         creation, evidence assembly, closure
Reconciliation   orphan charge, phantom order, amount mismatch
Failure          database down at order creation, Stripe outage,
                 network failure mid-confirmation, double submission
Security         amount tampering, card testing patterns, CSRF
```

E2E covers the full customer journey in Stripe test mode, including 3DS and decline paths.

---

# Future Expansion

**Subscriptions and recurring payments.**

Stripe Billing on the connected account. The quote engine already models line items; recurring intervals are an additional field.

**Platform application fees.**

Direct charges already support `application_fee_amount`. Enabling revenue share is a configuration change, not an architecture change. See [pricing-billing.md](./pricing-billing.md).

**Stripe Tax.**

Replacing merchant-configured rates with automatic calculation. The tax line item already exists in the quote.

**Multi-currency presentment.**

Displaying prices in the customer's currency while settling in the merchant's.

**Additional payment methods.**

`automatic_payment_methods` already surfaces whatever the merchant enables. New methods require no code change.

**Saved payment methods.**

Customer objects on the connected account, for repeat purchases.

**Alternative processors.**

The pricing engine, order model, and webhook pipeline are processor-agnostic. A second processor would implement the same service interface. This is deliberate but not scheduled.

**Fraud tooling.**

Stripe Radar rules configured per merchant, with our own signals contributed as metadata.

---

# Success Criteria

The integration is successful when:

- No merchant secret key has ever been stored in our systems.
- No card number has ever entered our DOM, our servers, or our logs.
- No customer has ever been charged twice for one purchase.
- No customer has ever been told a successful payment failed.
- Every successful charge has exactly one corresponding order, verified hourly.
- No order has ever been created from a browser assertion.
- Every amount charged equals an amount the server computed.
- An unverified webhook has never been acted upon.
- A merchant can connect Stripe and publish a working checkout in under five minutes.
- Stripe.js never appears on the critical rendering path.

---

# Philosophy

Every other subsystem in this product can be forgiving. This one cannot.

A rendering bug shows the wrong shade of blue. A payment bug takes money from someone and loses the record, or shows a customer a success page for a charge that never happened, or charges them twice for one purchase. Those are not defects in a product — they are breaches of trust with someone who was never our user in the first place.

So the rules here are deliberately unforgiving. The browser is never believed. The amount is always recomputed. The webhook is always verified. The order is always idempotent. And when all of that still fails, an hourly job goes looking for the money we lost track of.

The architecture is not paranoid because payments are complicated.

It is paranoid because when payments go wrong, the person harmed is a stranger who trusted our user, who trusted us.
