# Checkout Studio Testing Strategy

**Version:** 1.0

**Status:** Quality Assurance Specification

---

# Philosophy

Testing is not optional.

Every feature must be verified before it is considered complete.

No feature moves to the next phase until all required tests pass.

---

# Testing Pyramid

```
                E2E
          Integration Tests
          Unit Tests
```

Target ratio

- Unit Tests: 70%
- Integration Tests: 20%
- End-to-End Tests: 10%

---

# Testing Stack

## Unit Testing

- Vitest
- React Testing Library

---

## Integration Testing

- Vitest
- React Testing Library
- Mock Service Worker (MSW)

---

## End-to-End Testing

- Playwright

Three things about the harness, each of which cost an afternoon to find and each
of which looks like a broken feature rather than a broken test:

**The tests visit `localhost`, not `127.0.0.1`.** Next's dev server treats a
different host as a cross-origin dev request and refuses to serve part of the
client runtime. The page renders, React loads, and nothing is interactive — which
reads exactly like a hydration bug in the application.

**Interaction waits for hydration.** A keystroke or a click that lands before
React has taken over is simply lost: the markup is there, the handlers are not.
`e2e/support/hydration.ts` waits for the marker React leaves on the container it
hydrated. Without it, a test races the client bundle and fails on a busy machine.

**Fixtures need `--conditions=react-server`.** They create their account through
the same repositories the product uses, and those repositories declare themselves
`server-only` — correctly, since importing them from a client component would
leak database credentials into a bundle. That package throws unless the condition
is set, which Next sets and Playwright does not. The dev server must not inherit
it, so `webServer` clears `NODE_OPTIONS`.

**Sign in once per file.** Signing in per test spends the sign-in rate limit on
fixtures rather than on anything being tested, and that limit exists for a reason.
Create the session through the API once and add its cookie to each context.

---

## Accessibility Testing

- axe-core
- Playwright Accessibility Snapshot

---

## Performance Testing

- Lighthouse
- Web Vitals

---

# Coverage Targets

Minimum

```
Statements   90%
Branches     85%
Functions    90%
Lines        90%
```

Critical modules

```
100%
```

Examples

- Stripe
- Renderer
- Schema Parser
- State History
- Publishing

---

# What Must Be Unit Tested

Every utility.

Every hook.

Every reducer.

Every parser.

Every serializer.

Every validator.

Every formatter.

Every algorithm.

---

Examples

```
parseSchema()

serializeTree()

undo()

redo()

calculateTotals()

generateRevision()

validateCheckout()
```

---

# Component Testing

Every UI component must verify

- Rendering
- Props
- Variants
- Events
- Keyboard support
- Accessibility
- Responsive classes

Example

```
Button

✓ renders

✓ disabled state

✓ loading state

✓ icon variant

✓ click event

✓ keyboard enter

✓ keyboard space
```

---

# Form Testing

Every form must test

Validation

Submission

Errors

Success state

Loading state

Disabled state

Reset

Focus handling

---

# Store Testing

Every Zustand store tests

State creation

Actions

History

Undo

Redo

Selection

Clipboard

Persistence

---

# Renderer Testing

Renderer is one of the highest priority systems.

Test

Nested rendering

Unknown components

Responsive rendering

Conditional rendering

Performance

Schema validation

Large trees

---

# Drag & Drop Testing

Verify

Drag

Drop

Nested containers

Sorting

Keyboard dragging

Collision detection

Undo after drag

Redo after drag

---

# Stripe Testing

See [stripe-integration.md](./stripe-integration.md).

Must test

Payment Intent creation

Payment confirmation

Webhook validation

Payment failure

Refund

Duplicate webhook protection

Invalid signature rejection

---

# API Testing

Every endpoint must test

Authentication

Authorization

Validation

Errors

Success

Edge cases

Ownership

Rate limits

---

# Database Testing

Test

Create

Update

Delete

Soft delete

Relations

Transactions

Rollback

---

# Integration Testing

Test interaction between

Editor

↓

Store

↓

Renderer

↓

Database

↓

API

↓

Stripe

---

Example

Create checkout

↓

Save revision

↓

Publish

↓

Load published checkout

↓

Submit payment

↓

Create order

↓

Dashboard updates

---

# End-to-End Testing

Critical flows

---

## User Registration

Register

↓

Login

↓

Dashboard

---

## Create Checkout

Create project

↓

Add page

↓

Add components

↓

Save

↓

Reload

↓

Data persists

---

## Build Checkout

Add product

↓

Add payment

↓

Publish

↓

Preview

↓

Works correctly

---

## Checkout Flow

Customer visits checkout

↓

Fill form

↓

Payment

↓

Success

↓

Order created

↓

Confirmation

---

## Revision History

Edit

↓

Save

↓

Create revision

↓

Restore

↓

Changes restored

---

## Publish Flow

Draft

↓

Publish

↓

Public URL

↓

Edit

↓

Republish

↓

Latest revision visible

---

# Accessibility Testing

Every page must verify

Keyboard navigation

Focus order

Labels

ARIA

Color contrast

Reduced motion

Screen reader support

---

# Browser Support

Test latest versions of

Chrome

Edge

Firefox

Safari

---

# Responsive Testing

Desktop

1440px

Laptop

1280px

Tablet

768px

Mobile

390px

Small Mobile

320px

---

# Visual Regression

Playwright screenshots

Compare

Desktop

Tablet

Mobile

Components

Pages

Templates

---

# Performance Benchmarks

Editor load

<2 seconds

Canvas interaction

60 FPS

Selection

<16ms

Drag

60 FPS

Autosave

<500ms

Publish

<5 seconds

---

# Lighthouse Goals

Performance

95+

Accessibility

100

Best Practices

100

SEO

95+

---

# Memory Testing

Long editing sessions

1000+ components

No memory leaks

Undo history remains stable

---

# Stress Testing

Project with

100 pages

5000 components

Large images

Nested layouts

Editor remains responsive

---

# Error Testing

The error taxonomy and recovery paths under test are defined in [error-handling.md](./error-handling.md).

Simulate

Network failures

Stripe failures

Database failures

Upload failures

Expired sessions

Timeouts

---

# Security Testing

Verify

CSRF

XSS

SQL Injection

Rate limiting

Authentication

Authorization

Input sanitization

---

# AI Testing

Verify

Prompt generation

Schema generation

Invalid prompts

Fallback behavior

Rate limiting

---

# Regression Testing

Every bug fix

Requires

Regression test

before merge.

---

# CI/CD Pipeline

Every Pull Request runs

```
pnpm lint

pnpm typecheck

pnpm test

pnpm test:e2e

pnpm build
```

Merge blocked if any fail.

---

# Manual QA Checklist

Before release

✓ Login

✓ Logout

✓ Create project

✓ Edit checkout

✓ Publish

✓ Stripe payment

✓ Mobile

✓ Tablet

✓ Desktop

✓ Accessibility

✓ Performance

✓ Analytics

---

# Release Checklist

Production build

↓

Run migrations

↓

Smoke tests

↓

Lighthouse

↓

Deploy

↓

Health checks

↓

Monitor logs

↓

Verify Stripe

↓

Verify published checkouts

---

# Bug Severity

Critical

- Data loss
- Payment failure
- Security issue

High

- Publishing broken
- Editor crashes
- Renderer broken

Medium

- UI bugs
- Layout issues

Low

- Minor visual defects
- Typos

---

# Definition of Done

Per-phase testing obligations and exit criteria are defined in [phases.md](./phases.md).

A feature is complete only if

✓ Unit tests pass

✓ Integration tests pass

✓ E2E tests pass

✓ Accessibility passes

✓ Performance targets met

✓ Responsive verified

✓ Documentation updated

✓ Code reviewed

✓ No critical bugs

---

# Engineering Principles

Quality is built into every phase, not added at the end.

Tests are documentation.

Every bug becomes a new test.

The goal is confidence.

A feature should never ship unless the team can trust it.
