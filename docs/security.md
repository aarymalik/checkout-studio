# Checkout Studio Security Specification

**Version:** 1.0

**Status:** Security Architecture

---

# Overview

Security is a core architectural requirement of Checkout Studio.

Every feature must be designed with the assumption that it will be exposed to the public internet and may process sensitive customer information.

The platform follows a "Secure by Default" philosophy.

---

# Security Principles

Every component must follow these principles.

- Least Privilege
- Defense in Depth
- Secure by Default
- Zero Trust
- Fail Securely
- Encrypt Everything
- Never Trust Client Input
- Validate Everything
- Audit Sensitive Operations

---

# Authentication

Authentication is handled by Clerk.

Requirements

- Email Authentication
- Google Authentication
- GitHub Authentication (future)
- Magic Links
- MFA Support
- Session Expiration
- Secure Session Cookies

Never implement custom authentication.

---

# Authorization

Every request must verify ownership.

Example

User

↓

Project

↓

Page

↓

Revision

↓

Checkout

A user may never access another user's resources.

---

# Roles

Supported roles

Owner

Administrator

Editor

Viewer

Future

Organization Admin

Support Agent

---

# Permissions

Examples

Owner

- Everything

Administrator

- Everything except billing (see [pricing-billing.md](./pricing-billing.md))

Editor

- Edit projects
- Publish
- Create templates

Viewer

- Read only

---

# Session Security

Sessions must

- Expire automatically
- Rotate tokens
- Prevent fixation attacks

Cookies

- HttpOnly
- Secure
- SameSite=Lax

---

# Passwords

Passwords are never stored.

Authentication provider manages credentials.

---

# API Security

Every API route must

Authenticate

↓

Authorize

↓

Validate

↓

Execute

↓

Return sanitized response

Never expose internal errors.

---

# Input Validation

Every request must use Zod.

Never trust

- Query Parameters
- Request Body
- Headers
- Cookies

Validation occurs before business logic.

---

# SQL Injection

Prevented by

- Prisma ORM
- Parameterized Queries

Never use raw SQL unless absolutely required.

---

# XSS Protection

Escape all user content.

Never render unsanitized HTML.

Rich text must be sanitized.

Content Security Policy should prevent inline script execution.

---

# CSRF Protection

Server Actions

Route Handlers

Forms

must validate origin.

Sensitive actions require CSRF protection.

---

# Content Security Policy

Default Policy

- self

Two policies, because the two applications load different things.

Studio (`apps/studio`)

- Stripe (Connect onboarding, Billing Customer Portal)
- Clerk
- UploadThing
- Sentry, PostHog

Published checkouts (`apps/renderer`)

- Stripe (`js.stripe.com`, `api.stripe.com`, and Stripe's iframe origins)
- The origins of the tracking integrations the page actually enables, and no others
- Our asset CDN

Fonts are self-hosted on both, so no font origin is allowed.

Framework scripts carry a per-request nonce. No other inline script is permitted.

Reject unknown sources.

---

# Clickjacking

Enable

X-Frame-Options

```
DENY
```

Exception

Published checkout pages served on the `embed/[id]` route may be framed, and only by the hostnames the merchant registered for that embed, via `Content-Security-Policy: frame-ancestors`. Every other route keeps `DENY`. See **Embed Mode** in [renderer.md](./renderer.md).

---

# Scripts on Checkout Pages

A checkout page contains a payment form.

Any script running on that page could observe or alter it.

Merchant-supplied JavaScript is therefore never executed.

Rules

- The schema never contains executable code.
- The renderer never evaluates schema content, per [renderer.md](./renderer.md).
- Tracking is provided through first-class integrations (Google Analytics 4, Meta Pixel, TikTok Pixel, LinkedIn Insight), configured as data and loaded from each provider's allowlisted origin.
- Google Tag Manager is **not** offered. A GTM container is configured by the merchant and can inject arbitrary tags and scripts from any origin, so allowlisting its origin would reopen exactly the hole this policy closes.
- Every script origin on a published checkout is enumerated in its Content Security Policy.
- Third-party widgets render only inside sandboxed iframes.
- HTML Block and Code Block content is sanitized; `<script>`, event handler attributes, and `javascript:` URLs are removed.

This is also a PCI requirement.

PCI DSS v4 requires that every script on a payment page be inventoried, authorized, and integrity-checked. An allowlisted set of integrations satisfies that. Arbitrary merchant code cannot.

See [stripe-integration.md](./stripe-integration.md).

---

# Security Headers

Always send

- Strict-Transport-Security
- Content-Security-Policy
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- X-Frame-Options

---

# HTTPS

HTTPS is mandatory.

HTTP redirects automatically.

TLS 1.2+

---

# Encryption

Encryption in Transit

HTTPS

Encryption at Rest

Database encryption

Encrypted backups

Encrypted storage

---

# Secrets

Never commit

.env

Secrets include

- Stripe Keys
- Clerk Keys
- Database URL
- Redis URL
- UploadThing Keys

Production secrets managed by hosting provider.

---

# Stripe Security

The complete payment architecture is defined in [stripe-integration.md](./stripe-integration.md).

Never store

- Card Numbers
- CVV
- Expiration Dates

Payments handled exclusively by Stripe Elements.

Server verifies

- PaymentIntent
- Webhook Signature

Never trust payment success from the browser.

---

# Webhook Verification

Every webhook must verify

Stripe Signature

↓

Timestamp

↓

Event Type

↓

Replay Protection

Ignore invalid events.

---

# Rate Limiting

Apply rate limits to

Authentication

Publishing

Checkout creation

API endpoints

Public forms

Webhooks are **not** rate limited. They are authenticated by signature instead, and a rate limit could drop legitimate events during a burst. Concrete limits for public checkout endpoints are in [stripe-integration.md](./stripe-integration.md).

Redis should be used.

---

# Brute Force Protection

Protect

Login

Magic Links

Password Reset

API Tokens

---

# Bot Protection

Future

Cloudflare Turnstile

or

Google reCAPTCHA Enterprise

Only protect endpoints that require it.

---

# File Upload Security

Archive hardening and bundle sanitization for imports are defined in [export-import.md](./export-import.md).

Allowed

Images

SVG (sanitized)

Videos

Fonts (validated by magic bytes)

PDF

Maximum size

Configurable

Scan uploads before serving.

Reject executable files.

---

# Image Security

Strip metadata.

Optimize automatically.

Reject malformed images.

---

# CORS

Only allow trusted origins.

Never use

```
Access-Control-Allow-Origin: *
```

for authenticated APIs.

---

# Error Handling

See [error-handling.md](./error-handling.md).

Never expose

Stack traces

Database schema

SQL queries

Internal paths

Return generic messages.

Log detailed errors internally.

---

# Logging

The log record shape, redaction, and retention policy are defined in [observability.md](./observability.md).

Log

Authentication

Publishing

Orders

Stripe Events

API Errors

Permission Changes

Never log

Passwords

Tokens

Payment Details

Personal Information

---

# Audit Log

Track

Login

Publish

Delete

Restore

Billing Changes

Role Changes

API Key Creation

Audit logs are immutable and retained for 7 years (`AuditLog` in [database.md](./database.md)).

---

# Backup Security

Backups

Encrypted

Versioned

Access Controlled

Retention

30 Days

---

# Dependency Security

Weekly dependency updates.

Run

```
pnpm audit
```

before releases.

Replace vulnerable packages immediately.

---

# Supply Chain Security

Pin package versions.

Verify package integrity.

Review new dependencies before installation.

---

# Secure Coding Rules

Never use eval()

Never use Function()

Never use dangerouslySetInnerHTML unless sanitized.

Never trust client state.

Never expose secrets to the client.

---

# Accessibility & Security

Security features must remain accessible.

Examples

Keyboard navigation

Screen readers

Focus management

Accessible authentication flows

---

# Security Testing

Automated checks

- Dependency Audit
- Type Checking
- ESLint
- Unit Tests

Manual testing

- Authorization
- Permission Escalation
- Broken Access Control
- Payment Flow
- Session Management

---

# Incident Response

Detect

↓

Log

↓

Notify

↓

Contain

↓

Recover

↓

Postmortem

---

# Recovery Objectives

Maximum downtime

30 minutes

Maximum data loss

15 minutes

---

# Security Review Checklist

Before every release

✓ Authentication verified

✓ Authorization verified

✓ Secrets protected

✓ HTTPS enabled

✓ CSP validated

✓ Stripe webhook verification working

✓ Input validation complete

✓ Rate limiting enabled

✓ Logging enabled

✓ Dependency audit clean

✓ No high severity vulnerabilities

---

# Security Philosophy

Security is not a feature.

Security is part of every feature.

Every line of code should reduce risk, not introduce it.
