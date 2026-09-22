# Checkout Studio Deployment Guide

**Version:** 1.0

**Status:** Deployment & Operations Specification

---

# Overview

Checkout Studio must support reliable deployments across multiple environments while ensuring zero data loss, minimal downtime, and automated validation.

The deployment pipeline should be fully automated.

---

# Deployment Goals

- Zero downtime deployments
- Immutable builds
- Automated rollback
- Secure secrets management
- Repeatable deployments
- Infrastructure as Code
- Continuous Integration
- Continuous Delivery

---

# Environments

The project contains four environments.

```
Local

↓

Development

↓

Staging

↓

Production
```

---

# Local Development

Purpose

Developer environment.

URL

```
http://localhost:3000
```

Database

Local PostgreSQL

Redis

Local Redis

Storage

Local UploadThing development

Payments

Stripe Test Mode

---

# Development Environment

Purpose

Internal feature development.

Deployment

Automatic

Branch

```
develop
```

Database

Shared Development Database

Stripe

Test Mode

---

# Staging Environment

Purpose

QA and release verification.

Deployment

Automatic after merge to

```
main
```

Features

Production configuration

Test payments

Smoke testing

Lighthouse testing

Accessibility testing

---

# Production

Purpose

Customer-facing application.

Domain

```
https://app.checkoutstudio.com
```

Infrastructure

Vercel

PostgreSQL

Redis

UploadThing

Stripe Live

---

# Infrastructure

Frontend

- Vercel

Backend

- Next.js Route Handlers
- Server Actions

Database

- PostgreSQL

ORM

- Prisma

Authentication

- Clerk

Cache

- Upstash Redis

File Storage

- UploadThing

Payments

- Stripe (see [stripe-integration.md](./stripe-integration.md))

Analytics

- PostHog

Email

- Resend (future)

---

# Repository Strategy

```
main

develop

feature/*

release/*

hotfix/*

docs/*
```

Rules

main

Production only. Merges from release/* or hotfix/*.

develop

Integration branch.

feature

One feature per branch.

release

Stabilization for one release, cut from develop, merged to main.

hotfix

Urgent production fix, cut from main, merged back to develop the same day.

Full process: [contributing.md](./contributing.md) and [release-process.md](./release-process.md).

---

# Pull Request Flow

Feature Branch

↓

Open PR

↓

CI Runs

↓

Code Review

↓

Merge

↓

Deploy

---

# Continuous Integration

Every commit executes

```
pnpm install

pnpm lint

pnpm typecheck

pnpm test

pnpm build
```

Failures block merge.

---

# Continuous Deployment

Development

Automatic

Staging

Automatic

Production

Manual approval

---

# Build Process

1.

Install dependencies

↓

2.

Generate Prisma Client

↓

3.

Run TypeScript checks

↓

4.

Run ESLint

↓

5.

Run Unit Tests

↓

6.

Run Integration Tests

↓

7.

Run Build

↓

8.

Generate Production Bundle

↓

9.

Deploy

---

# Environment Variables

Never commit

```
.env
```

Use

```
.env.local

.env.development

.env.staging

.env.production
```

Secrets include

- Clerk Keys
- Stripe Keys
- Database URL
- Redis URL
- UploadThing Keys
- Encryption Keys

---

# Database Deployment

Migration flow

```
Generate Migration

↓

Review

↓

Run on Staging

↓

Verify

↓

Run on Production
```

Never modify production schema manually.

---

# Backups

Database

Continuous point-in-time recovery (write-ahead log archiving), plus daily snapshots.

Point-in-time recovery is what meets the 15-minute data-loss target below; daily backups alone cannot.

Retention

30 days

Assets

Cloud storage redundancy.

Configuration

Git repository.

---

# Rollback Strategy

Application rollback

Redeploy previous build.

Database rollback

Not part of a release rollback. Migrations are expand-only within a release, so the previous build runs against the current database unchanged, per [release-process.md](./release-process.md).

Restoring a backup is a disaster-recovery action, never a rollback step: it would discard every order, draft, and publish since the backup was taken.

---

# Monitoring

Telemetry, SLOs, dashboards, and alerting are defined in [observability.md](./observability.md).

Monitor

- Application uptime
- Response time
- Errors
- Database health
- Queue health
- Payment failures

Integrations

- Sentry — errors and performance
- PostHog — product analytics
- Uptime monitoring — external checks against `/api/health`

Required by Phase 21. Specified in [observability.md](./observability.md).

---

# Logging

Structured logs only.

Every request includes

- Request ID
- User ID
- Project ID
- Timestamp
- Duration

Never log

Passwords

Tokens

Payment details

Personal information

---

# Error Reporting

Production errors

↓

Captured

↓

Reported

↓

Alert created

↓

Assigned

---

# Health Checks

Expose

```
/api/health
```

Returns

```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "stripe": "available",
  "version": "1.0.0"
}
```

---

# Cache Strategy

Redis

Session cache

Editor cache

Published schema cache

CDN

Images

Fonts

Static assets

Browser Cache

Static resources

---

# Image Optimization

Use Next.js Image.

Automatically

Compress

Resize

Lazy load

Modern formats

---

# Security Headers

Enable

- CSP
- HSTS
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

---

# SSL

HTTPS required.

HTTP redirects automatically.

Certificates managed by Vercel.

---

# Publish Workflow

Editor

↓

Save Revision

↓

Validate

↓

Publish

↓

Invalidate Cache

↓

Generate Static Output

↓

Available Worldwide

---

# Release Process

Versioning, release gates, canary rollout, rollback, and hotfixes are defined in [release-process.md](./release-process.md).

1.

Merge to main

↓

2.

CI passes

↓

3.

Deploy to staging

↓

4.

Smoke tests

↓

5.

Manual approval

↓

6.

Deploy production

↓

7.

Monitor

---

# Smoke Tests

Verify

- Login
- Dashboard
- Editor
- Save
- Publish
- Stripe Checkout
- Public Checkout
- Order Creation

---

# Disaster Recovery

Database failure

↓

Restore latest backup

↓

Verify integrity

↓

Resume service

Target Recovery Time

< 30 minutes

Target Data Loss

< 15 minutes

---

# Versioning

Semantic Versioning

```
MAJOR.MINOR.PATCH
```

Example

```
1.0.0
```

---

# Feature Flags

All experimental features

Must be behind feature flags.

Allows

- Internal testing
- Gradual rollout
- Instant disable

---

# Deployment Checklist

Before Production

✓ Build passes

✓ Tests pass

✓ Migrations verified

✓ Stripe Live Mode verified

✓ Environment variables verified

✓ Health checks passing

✓ Accessibility verified

✓ Lighthouse ≥95

✓ Backups verified

✓ Monitoring active

---

# Maintenance

Scheduled maintenance

Communicated in advance.

Deployments should avoid peak traffic hours.

---

# Engineering Principles

Deployments must be repeatable.

Infrastructure should be automated.

Recovery should be documented.

Production should always be observable.

Every deployment should increase confidence, not risk.
