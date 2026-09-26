# Checkout Studio API Specification

**Version:** 1.0

**Status:** API Contract

---

# Overview

Checkout Studio exposes a versioned API for:

- Authentication
- Projects
- Pages
- Revisions
- Assets
- Templates
- Orders
- Stripe
- Publishing
- AI
- Analytics

The API follows REST principles internally while using Next.js Route Handlers and Server Actions.

All responses use a standard response envelope.

---

# Base URL

Development

```
http://localhost:3000/api/v1
```

Production

```
https://app.checkoutstudio.com/api/v1
```

---

# Response Format

Every endpoint returns:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {}
}
```

Error response

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project not found."
  }
}
```

---

# HTTP Status Codes

200 OK

201 Created

204 No Content

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Validation Error

429 Too Many Requests

500 Internal Server Error

---

# Authentication

Authentication is ours: a session cookie, resolved against the Session table on
every request. See [security.md](./security.md).

The cookie carries an opaque token and nothing else. Anything a route needs to
know about the caller is read from the database, so a change in role or a
revoked session takes effect on the next request rather than whenever a token
happens to expire.

Every protected request automatically includes:

Authenticated User ID

Organization ID (future)

Session

No API key required for authenticated dashboard requests.

---

# Projects

## Get Projects

GET

```
/projects
```

Returns

All user projects.

---

## Create Project

POST

```
/projects
```

Body

```json
{
  "name": "My Checkout"
}
```

Returns

Project

---

## Get Project

GET

```
/projects/{id}
```

---

## Update Project

PATCH

```
/projects/{id}
```

---

## Delete Project

DELETE

```
/projects/{id}
```

Soft delete only.

---

# Pages

## Get Pages

GET

```
/projects/{projectId}/pages
```

---

## Create Page

POST

```
/projects/{projectId}/pages
```

---

## Duplicate Page

POST

```
/pages/{id}/duplicate
```

---

## Delete Page

DELETE

```
/pages/{id}
```

---

# Drafts

The draft is the mutable working copy of a page. Autosave writes here. See [history-versioning.md](./history-versioning.md).

## Get Draft

GET

```
/pages/{id}/draft
```

Returns

Schema

Draft Version

---

## Save Draft

PATCH

```
/pages/{id}/draft
```

Body

```json
{
  "baseVersion": 14,
  "patch": [
    { "op": "replace", "path": "/nodes/heading_h82k/props/text", "value": "Complete your order" }
  ]
}
```

`patch` is an RFC 6902 JSON Patch against the draft at `baseVersion`. Only changed data is sent, per [performance.md](./performance.md).

The server applies the patch, validates the resulting schema, and rejects any patch that produces an invalid tree.

Returns the new `draftVersion`.

If `baseVersion` is not the current version, returns `409 CONFLICT` with a diff summary. There is no unconditional write path.

Creates no revision.

---

# Edit Sessions

Prevents two writers on one page before real-time collaboration exists. See **Concurrent Editing** in [history-versioning.md](./history-versioning.md).

## Claim Session

POST

```
/pages/{id}/session
```

Returns the session, or `409` with the current holder's client label and last heartbeat.

---

## Heartbeat

PUT

```
/pages/{id}/session
```

Every 30 seconds. The session expires after 90 seconds without one.

---

## Take Over Session

POST

```
/pages/{id}/session/takeover
```

Notifies the current holder, waits for its pending autosave to flush, then transfers the session.

---

## Release Session

DELETE

```
/pages/{id}/session
```

---

# Revisions

## Save Revision

POST

```
/pages/{id}/revisions
```

Creates an immutable, named snapshot of the current draft.

---

## List Revisions

GET

```
/pages/{id}/revisions
```

---

## Get Revision

GET

```
/revisions/{id}
```

---

## Restore Revision

POST

```
/revisions/{id}/restore
```

Saves the current draft as a `recovery` revision, then copies the selected revision into the draft.

The restored revision is never modified. Nothing is overwritten.

---

# Publish

## Publish Page

POST

```
/pages/{id}/publish
```

Workflow

Validate

↓

Create immutable revision

↓

Update publishedRevisionId

↓

Clear CDN cache

↓

Return published URL

The revision is created from the **draft**, never from a previous revision.

---

## Unpublish Page

POST

```
/pages/{id}/unpublish
```

Clears `publishedRevisionId`. The revision itself is retained.

---

## Create Preview Link

POST

```
/pages/{id}/preview-tokens
```

Returns a signed, expiring URL on `apps/renderer` (`preview/[token]`) that renders the current draft.

---

## Revoke Preview Link

DELETE

```
/preview-tokens/{id}
```

---

# Domains

Custom domains for published checkouts. Verifying or removing a domain also registers or unregisters it as a Stripe payment method domain, per [stripe-integration.md](./stripe-integration.md).

```
GET     /projects/{projectId}/domains
POST    /projects/{projectId}/domains              add a hostname; returns DNS records to create
POST    /domains/{id}/verify                        check DNS, provision SSL
DELETE  /domains/{id}
```

---

# Embeds

```
POST    /pages/{id}/embeds                          register the host hostnames allowed to frame the page
GET     /pages/{id}/embeds
DELETE  /embeds/{id}
```

The registered hostnames populate the `frame-ancestors` policy and are registered as payment method domains.

---

# Submissions

Non-payment form submissions from published pages.

```
POST    /api/checkout/submissions                   public, on apps/renderer, rate limited
GET     /pages/{id}/submissions                     authenticated
```

---

# Coupons

```
GET     /projects/{projectId}/coupons
POST    /projects/{projectId}/coupons
PATCH   /coupons/{id}
DELETE  /coupons/{id}                               deactivates; redemptions are retained
```

See [stripe-integration.md](./stripe-integration.md).

---

# Billing

Our own subscriptions. Fully specified in [pricing-billing.md](./pricing-billing.md).

```
GET     /billing/subscription
GET     /billing/entitlements
GET     /billing/usage
GET     /billing/plans
POST    /billing/checkout-session                   first subscription only
POST    /billing/change-plan
POST    /billing/portal-session
POST    /billing/cancel
POST    /billing/reactivate
POST    /billing/trial
```

Owner only.

---

# Export & Import

Fully specified in [export-import.md](./export-import.md).

```
POST    /export/pages/{pageId}
POST    /export/projects/{projectId}
POST    /export/themes/{themeId}
POST    /export/orders
GET     /export/jobs/{jobId}
POST    /import/analyze
POST    /import/commit
GET     /import/jobs/{jobId}
```

---

# Assets

## Upload Asset

POST

```
/assets
```

Multipart upload.

Supported

Images

Videos

SVG

Fonts

PDF

---

## Get Assets

GET

```
/assets
```

Supports

Pagination

Search

Filtering

Sorting

---

## Delete Asset

DELETE

```
/assets/{id}
```

Soft delete.

---

# Templates

## List Templates

GET

```
/templates
```

---

## Create Template

POST

```
/templates
```

---

## Install Template

POST

```
/templates/{id}/install
```

---

# Orders

## List Orders

GET

```
/orders
```

Supports

Search

Date range

Status

Pagination

---

## Get Order

GET

```
/orders/{id}
```

---

## Refund Order

POST

```
/orders/{id}/refund
```

Uses Stripe.

---

# Stripe

The full payment architecture — Connect onboarding, the pricing engine, webhook verification, and order creation — is defined in [stripe-integration.md](./stripe-integration.md).

Our own subscription billing is a separate integration, defined in [pricing-billing.md](./pricing-billing.md).

## Merchant Endpoints

Authenticated, on `apps/studio`, under `/api/v1`.

```
POST   /stripe/connect/authorize
GET    /stripe/connect/callback
POST   /stripe/connect/disconnect
GET    /stripe/connect/status
```

---

## Customer Endpoints

Public and rate limited, on `apps/renderer`, same-origin with the checkout.

```
POST   /api/checkout/quote
POST   /api/checkout/payment-intent
GET    /api/checkout/status/{sessionId}
```

The payment intent endpoint accepts a signed quote, never an amount, and returns only the client secret.

There is no server-side confirm endpoint. The customer's browser confirms with Stripe.js directly, and the order is created only from the verified webhook. A confirm endpoint would invite trusting the browser's claim of success.

---

## Webhooks

Unversioned, signature-verified, raw body.

```
POST   /api/webhooks/stripe            apps/renderer   Connect (merchant payments)
POST   /api/webhooks/stripe-billing    apps/studio     Billing (our subscriptions)
```

Separate endpoints, separate signing secrets, separate failure domains.

---

# AI

## Generate Checkout

POST

```
/ai/generate
```

Body

Prompt

Returns

Schema

---

## Improve Copy

POST

```
/ai/rewrite
```

Returns

Improved content.

---

## Generate FAQ

POST

```
/ai/faq
```

---

## Generate Colors

POST

```
/ai/theme
```

---

# Analytics

## Dashboard

GET

```
/analytics/dashboard
```

Returns

Revenue

Orders

Conversion

Visitors

AOV

---

## Events

POST

```
/analytics/event
```

Used internally.

---

# Search

Global search endpoint

GET

```
/search
```

Supports

Projects

Pages

Templates

Assets

Orders

---

# Validation

All requests use Zod.

Invalid requests return

422

with detailed validation errors.

---

# Pagination

Standard format

```json
{
  "page": 1,
  "pageSize": 25,
  "total": 120,
  "totalPages": 5
}
```

---

# Filtering

Supported

status

createdAt

updatedAt

search

sort

direction

---

# Rate Limiting

Dashboard

100 requests/minute

Public checkout

Per endpoint, per session and per IP, as specified in [stripe-integration.md](./stripe-integration.md)

AI endpoints

Per user and per token budget, as specified in [ai-assistant.md](./ai-assistant.md)

Export and import

As specified in [export-import.md](./export-import.md)

Webhooks

Not rate limited — authenticated by signature

---

# Caching

Assets

CDN cached

Templates

Cached

Published pages

Cached

Authenticated API

Never cached

---

# Error Codes

The complete error code catalog, severity model, and recovery behavior are defined in [error-handling.md](./error-handling.md).

Examples

PROJECT_NOT_FOUND

PAGE_NOT_FOUND

SCHEMA_INVALID

STRIPE_NOT_CONNECTED

PAYMENT_DECLINED

QUOTA_EXCEEDED

VALIDATION_ERROR

UNAUTHORIZED

FORBIDDEN

---

# Security

Every endpoint validates:

Authentication

Authorization

Ownership

Input

Output

Sensitive operations require CSRF protection.

---

# Logging

See [observability.md](./observability.md).

Every write operation logs:

User

Project

Action

Timestamp

IP (where appropriate)

Request ID

---

# API Versioning

Current

```
v1
```

Future versions

```
v2

v3
```

Breaking changes require a new version.

---

# Engineering Principles

The API should be:

Consistent

Predictable

Versioned

Secure

Typed

Documented

Every endpoint should return predictable structures.

Every error should be actionable.

Every request should be validated before execution.
