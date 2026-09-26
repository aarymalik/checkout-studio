# Checkout Studio Database Specification

**Version:** 1.0

**Status:** Core Technical Specification

---

# Overview

Checkout Studio is a multi-tenant SaaS platform.

The database is designed for:

- Unlimited users
- Unlimited projects
- Unlimited checkout pages
- Immutable version history
- Stripe payment integration
- Asset management
- Templates
- Team collaboration (future)
- Plugin support (future)

The database must be scalable, secure, and optimized for production workloads.

---

# Database Technology

ORM:
Prisma

Database:
PostgreSQL

Caching:
Redis (Upstash)

File Storage:
UploadThing

Authentication:
Ours — see [security.md](./security.md)

Transactional email:
Resend

---

# Entity Relationship Overview

```
User
│
├── Projects
│      │
│      ├── Pages
│      │      │
│      │      ├── Revisions
│      │      ├── Orders
│      │      └── Assets
│      │
│      ├── Themes
│      ├── Templates
│      └── Domains
│
└── Subscription
```

---

# Core Entities

## User

Represents a Checkout Studio account.

Fields:

- id
- email (unique, lowercased on write — two spellings of an address are one account)
- emailVerifiedAt (null until the address is proven)
- passwordHash (Argon2id; see [security.md](./security.md))
- fullName
- avatar
- platformRole (`user` · `staff`)
- createdAt
- updatedAt

`passwordHash` is never selected by a repository method that returns a User to
the rest of the product. It is read by exactly one function, which compares it
and returns a boolean — a hash that never leaves the authentication service
cannot be logged, serialised into a response, or included in an export by
accident.

The user's plan is not stored here. Entitlements are computed from the Subscription on every request, per [pricing-billing.md](./pricing-billing.md).

`platformRole` distinguishes customers from Checkout Studio staff. The Owner · Administrator · Editor · Viewer roles in [security.md](./security.md) are per-organization and live on Membership, which arrives with Organizations in Phase 22. Until then, every project has exactly one user: its owner.

Relationships:

- owns Projects
- has Sessions
- has VerificationTokens
- has Subscription (see [pricing-billing.md](./pricing-billing.md))

---

## Session

A signed-in browser. One row per session, so any one of them can be ended.

Fields:

- id
- userId
- tokenHash (the cookie's value, hashed — a leaked table yields no working cookie)
- expiresAt
- revokedAt (null while live)
- createdAt · lastUsedAt
- userAgent · ipHash (what a person sees on their "active sessions" screen)

Sessions are rows rather than signed claims because a claim is valid until it
expires no matter what is learned about it in between. Signing out, changing a
password and "sign out everywhere" are all the same operation here: set
`revokedAt`.

Lookups are cached in Redis under the token hash, so the common path is not a
database round trip. The cache is dropped on revocation, and a miss falls
through to the table — the table is the truth.

Indexes: `tokenHash` unique · `(userId, revokedAt)` · `expiresAt` for the sweep.

Relationships:

- belongs to User

---

## VerificationToken

A one-time link: confirm an email address, or reset a password.

Fields:

- id
- userId
- tokenHash (hashed, for the same reason as a session)
- purpose (`verify-email` · `reset-password`)
- expiresAt (an hour for a reset, a day for a verification)
- consumedAt (null until used, set in the same transaction as the effect)
- createdAt

Consuming a token and performing its effect happen in one transaction. A reset
that succeeds while the token stays unconsumed is a reset link that works twice.

Issuing a new token for a purpose invalidates the outstanding ones for that
purpose, so a forwarded older email cannot be used after someone asks again.

Relationships:

- belongs to User

---

## Project

Represents a business or workspace.

Fields:

- id
- userId
- name
- slug
- description
- logo
- favicon
- defaultThemeId
- publishedPageId
- createdAt
- updatedAt

Relationships:

- belongs to User
- has many Pages
- has many Assets
- has many Templates

---

## Page

Represents one checkout page.

Examples:

- Main Checkout
- Upsell
- Downsell
- Thank You
- Lead Capture

Fields:

- id
- projectId
- title
- slug
- status
- schemaVersion
- draftSchema
- draftVersion
- currentRevisionId
- publishedRevisionId
- createdAt
- updatedAt

`draftSchema` (JSONB) is the mutable working copy. Autosave writes here.

`draftVersion` is a monotonic integer incremented in the same transaction as every draft write. It is the optimistic concurrency token defined in [history-versioning.md](./history-versioning.md).

`currentRevisionId` points to the most recent revision. `publishedRevisionId` points to the revision the public page serves.

Relationships:

- belongs to Project
- has many Revisions
- has many Orders

---

## Revision

Immutable snapshot of a page.

Contains:

- JSON Schema
- Theme snapshot
- Metadata

Fields:

- id
- pageId
- number
- kind
- name
- schema
- theme
- symbols
- schemaVersion
- rendererVersion
- createdBy
- createdAt

`number` is a sequential integer per page (1, 2, 3…).

`kind` records why the revision exists: `manual`, `publish`, `import`, or `recovery`.

`theme` is the fully resolved theme at the moment of creation — the project theme with the page's overrides applied. `symbols` holds the definitions of every symbol the schema instances. Together with `schema`, they make every revision a complete, self-rendering snapshot that later theme or symbol edits cannot change.

Revisions have no mutable fields. Whether a revision is live is derived from `Page.publishedRevisionId`, never stored on the revision.

Publishing never modifies revisions.

Publishing points a Page to a Revision.

---

## Asset

Represents uploaded media.

Supported:

Images

Videos

SVG

Icons

Fonts

PDF

Fields:

- id
- projectId
- fileName
- mimeType
- size
- width
- height
- storageKey
- url
- createdAt

---

## Theme

Reusable design tokens.

Contains:

Colors

Typography

Spacing

Radius

Buttons

Inputs

Cards

Effects

Themes are project-level records. Every page references one by `themeId`, per [schema.md](./schema.md), so editing a theme restyles every page in the project.

Published revisions snapshot the resolved theme, so a live page never changes when a theme is edited.

Fields:

- id
- projectId
- name
- version
- tokens (JSONB — the `CheckoutTheme` in [theme-system.md](./theme-system.md))
- extendsThemeId
- createdAt
- updatedAt

---

## Symbol

A reusable subtree shared across pages. See [template-system.md](./template-system.md).

Fields:

- id
- projectId
- name
- version
- rootNodeId
- nodes (JSONB — same node shape as a page schema)
- createdAt
- updatedAt

Pages place symbols with `core.symbol-instance` nodes. Published revisions snapshot the definitions they use.

---

## Template

Reusable checkout.

Contains:

Schema

Theme

Metadata

Preview image

Category

Templates may be:

Private

Public

Marketplace (future)

---

## Order

Represents one successful checkout.

Created only from a verified Stripe webhook, never from a browser assertion. See [stripe-integration.md](./stripe-integration.md).

Fields:

- id
- pageId
- revisionId
- stripeAccountId
- stripePaymentIntentId
- stripeCustomerId
- currency
- subtotal
- discount
- tax
- shipping
- total
- amountRefunded
- status (`paid` · `refund_pending` · `partially_refunded` · `refunded`)
- disputeStatus (`none` · `open` · `won` · `lost`)
- customerId
- checkoutSessionId
- formData (JSONB — submitted non-payment fields)
- ip
- userAgent
- metadata
- createdAt

`revisionId` records exactly which published revision the customer saw. Dispute evidence depends on it, so a revision referenced by an order is never pruned.

`ip`, `userAgent`, and `formData` are dispute evidence. They are part of the financial record and follow its retention, not the 7-day telemetry retention in [observability.md](./observability.md).

---

## OrderItem

One line of an order, frozen at purchase time.

Fields:

- id
- orderId
- nodeId (the product or bump node in the revision)
- kind (`product` · `bump` · `shipping` · `discount` · `tax`)
- label
- quantity
- unitAmount
- amount

Amounts are integers in minor units.

---

## Customer

A merchant's customer, scoped to one project. Never shared across projects or merchants.

Fields:

- id
- projectId
- email
- name
- phone
- stripeCustomerId (on the connected account)
- createdAt

Unique on (projectId, email).

---

## CheckoutSession

One customer's attempt at one checkout. Issued by the server on the first quote request and returned in its response.

Fields:

- id
- pageId
- revisionId (the revision being served)
- status (`open` · `processing` · `completed` · `abandoned` · `expired`)
- latestQuoteId
- stripePaymentIntentId
- couponRedemptionId
- ip
- userAgent
- createdAt
- expiresAt (24 hours)

The session is how the server finds the existing PaymentIntent to update when the cart changes, and how `/api/checkout/status/{sessionId}` answers before an order exists.

---

## Coupon

Defined by the merchant in Checkout Studio. Stripe coupon objects are **not** used, because they cannot be applied to a PaymentIntent.

Fields:

- id
- projectId
- code (unique per project, case-insensitive)
- type (`percent` · `fixed`)
- value
- currency (fixed-amount coupons only)
- minimumAmount
- appliesToNodeIds (empty = whole order)
- startsAt
- endsAt
- maxRedemptions
- active
- createdAt

---

## CouponRedemption

Fields:

- id
- couponId
- checkoutSessionId
- orderId
- status (`held` · `redeemed` · `released`)
- heldUntil
- createdAt

A redemption is **held** when the PaymentIntent is created. The limit is checked at that moment, inside a transaction that counts held plus redeemed rows. It becomes **redeemed** from the payment-succeeded webhook, and is **released** on cancellation or when the hold expires after 30 minutes. Holding before payment is what prevents two customers from both taking the last redemption.

---

## StripeConnection

A project's connected Stripe account. Specified in [stripe-integration.md](./stripe-integration.md).

Fields:

- id
- projectId
- stripeAccountId
- chargesEnabled
- payoutsEnabled
- detailsSubmitted
- defaultCurrency
- country
- capabilities
- requirements
- status (`active` · `revoked`)
- connectedAt
- lastSyncedAt

Never stores a secret key.

One Stripe account may back several projects. Disconnecting is project-local; see **Disconnection** in [stripe-integration.md](./stripe-integration.md).

---

## WebhookEvent

Every verified Stripe event, persisted before processing.

Fields:

- id
- stripeEventId (unique)
- source (`connect` · `billing`)
- stripeAccountId
- type
- payload
- status (`received` · `processed` · `failed`)
- attempts
- receivedAt
- processedAt

Provides permanent deduplication and a durable retry queue.

---

## Subscription

Our own billing, on our platform Stripe account. Specified in [pricing-billing.md](./pricing-billing.md), together with UsageRecord and BillingEvent.

---

## Submission

Stores non-payment form submissions.

Examples:

Lead Capture

Newsletter

Waitlist

Contact Form

Fields:

- id
- pageId
- payload
- createdAt

---

## Domain

Represents a custom domain.

Fields:

- id
- projectId
- hostname
- sslStatus
- verified
- primary

Future support:

Multiple domains

---

## Plugin

Reserved for future marketplace.

Fields:

- id
- name
- version
- author
- enabled
- configuration

---

# Relationships

User

↓

Projects

↓

Pages

↓

Revisions

↓

Published Revision

↓

Orders

Assets belong to Projects.

Themes belong to Projects.

Templates belong to Projects.

---

# Revision Strategy

Autosave:

Updates `Page.draftSchema` in place. Creates no revision.

Manual save:

Named revision

Publish:

Revision, then `publishedRevisionId` updated

Restore:

Current draft saved as a `recovery` revision, then the chosen revision copied into the draft

Conflict resolution:

Discarded side saved as a `recovery` revision

Every revision is immutable. Older revisions never change.

---

# Publishing Workflow

Editor

↓

Draft

↓

Validation

↓

Revision created from the draft (kind `publish`)

↓

Publish

↓

Published Revision ID updated

↓

Renderer loads published revision

---

# Autosave

Changes are stored every 5 seconds.

Autosave writes only the draft. It never creates a revision, so frequent saves cost no history storage.

Every draft write carries `baseVersion`; a stale write is rejected with `409 CONFLICT`.

---

# Soft Deletes

Projects

Pages

Templates

Assets

use soft delete.

Fields:

- deletedAt

Orders are never deleted.

---

# Audit Trail

Every important action is logged.

Examples:

Created Project

Published Checkout

Deleted Asset

Changed Theme

Restored Revision

Refunds

Data exports

Billing changes

---

## AuditLog

Append-only. Rows are never updated or deleted, enforced by database permissions rather than application code.

Fields:

- id
- actorId
- actorType (`user` · `staff` · `system`)
- action
- entityType
- entityId
- projectId
- metadata
- ip
- requestId
- createdAt

Retention: 7 years, per [security.md](./security.md).

The write path is built in Phase 2 so every later phase can record audit entries. The viewer arrives with Enterprise features in Phase 22.

---

# Search

Projects

Templates

Assets

Pages

must support full-text search.

---

# Indexing

Create indexes for:

userId

projectId

pageId

slug

status

createdAt

updatedAt

stripePaymentIntentId (unique — the last line of defense against duplicate orders)

stripeEventId (unique)

stripeAccountId

checkoutSessionId

(projectId, code) on Coupon — unique, case-insensitive

(projectId, email) on Customer — unique

hostname

---

# Security

Users may access only their own projects.

Every query must validate ownership.

Never expose:

Stripe Secret Keys

Passwords

Private Tokens

API Secrets

---

# Multi-Tenancy

Every entity belongs to a tenant.

Tenant isolation must exist at every query.

Future support:

Organizations

Teams

Roles

Permissions

without database redesign.

---

# Transactions

Use database transactions for:

Publishing

Order creation

Asset deletion

Revision restoration

Theme duplication

Project duplication

---

# Backups

Migration discipline and the expand/contract rule are defined in [release-process.md](./release-process.md).

Database backups:

Daily

Point-in-time recovery enabled.

---

# Performance

Large JSON schemas should remain in JSONB columns.

Frequently queried fields remain relational.

Avoid unnecessary joins.

Use pagination for large datasets.

---

# Future Expansion

The schema must support:

AI-generated pages

Collaboration

Comments

Shared projects

Marketplace templates

Marketplace plugins

Localization

A/B testing

Analytics

Version comparison

without breaking existing data.

---

# Engineering Principles

The database stores data.

The schema stores structure.

The renderer displays pages.

The editor edits pages.

The server coordinates everything.

Each layer has one responsibility.
