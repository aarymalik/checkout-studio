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

## In practice

`pnpm test:visual` runs `apps/studio/playwright.visual.config.ts` against the
gallery at `/design`, which exists only outside production. Three suites:
`gallery.spec.ts` photographs the interface components, `components.spec.ts`
photographs the plugin components through the renderer, at three breakpoints,
and `inspector.spec.ts` photographs the property panel. A unit test beside each
of the two component case lists asserts that every component the library
exports, and every type the registry holds, appears in a case — so a new
component cannot arrive unphotographed.

## The inspector is photographed because its faults are invisible to tests

Three faults in the panel shipped in a row, and no test could have caught any
of them: jsdom has no layout, so eleven hundred tests passed while a unit
picker sat a row below the numbers it belonged to, and passed again while a
four-column grid of spacing boxes rendered as four stacked blocks because the
class produced no CSS at all. Every one was found by somebody looking at the
screen.

The gallery at `/design/inspector` renders the real panel — through
`propertiesFor` and `valuesFor` with the shipped registry, never definitions
written for the picture — against a freshly inserted node, which is the state
where every value comes from the component's own defaults.

A case names a component **and a section**. The panel keeps one section open at
a time, so a case that did not say which one it wanted photographed whichever
opened by itself, and the four-side spacing boxes stayed behind a closed header
in every picture.

A case may also carry a **search**, which the spec types into the field rather
than handing in as a prop. The query belongs to the panel, the way the open
section does, and a gallery that reached past the field to set it would be
photographing a state the product cannot reach.

A case may also name the **breakpoint** it is edited at, and give the node
values at more than one of them — an override is only legible beside the value
it overrides, so the tablet case holds both.

A case may also give the node values **of its own**. Everything else in the
gallery is a freshly inserted node, which is the right subject for most of the
panel and the wrong one for anything that appears only once somebody has
changed something — the per-property reset exists only on an overridden
property, so a gallery of fresh nodes would photograph it never.

The first four pictures found four defects that the test suite, the type
checker and the linter all passed: a Max width reading "none is not a plain
length" about a Section's own default, four padding boxes each rendering
`{spac` where a theme reference had been cut off, a Level reading "Select…"
over a heading whose level was 2, and — behind that last one — a select that
wrote the string `"3"` where the renderer expects the number, so picking a
heading level did nothing at all.

### This suite allows two dozen pixels, and that number was measured

The rest of the suite allows two changed pixels in a thousand — 1152 on a
480×1200 panel — which is right for a page of product where a hairline of
antialiasing on a shadow is not a regression. It is also enough to hide a whole
word: the Level fix changed "Select…" to "Heading 2" and the suite went on
passing against the old picture.

A panel is text and boxes, and a word is the smallest thing worth catching in
one, so `inspector.spec.ts` sets its own `maxDiffPixels`.

It was **zero** for three slices, which turned out to be too strict by exactly
one hairline. Two CI runs of identical code differed by **four pixels**, every
one of them at x=160 — the panel's one-pixel left border — with a largest
channel delta of 39. That is sub-pixel antialiasing on a vertical line, and
chasing it would mean re-adopting a baseline every few runs until nobody read
them any more.

**Twenty-four** is six times that noise and well under the smallest change
worth catching. One character of body text is roughly a hundred pixels of
glyph, of which forty or so differ when the character changes — so a word
still fails and a hairline no longer does.

If a baseline ever comes back "changed" with no change behind it, measure
before adjusting: decode both PNGs, count the differing pixels, and see where
they are. Four pixels in a vertical line at the panel's edge is noise; forty in
a cluster is a glyph.

## Baselines are per platform

Text rasterises differently on macOS and Linux, so the path carries the
platform: `visual/__screenshots__/{darwin,linux}/`. A local run writes and
compares `darwin`; CI runs on Linux and compares `linux`, which means **a new
case needs both**, and only one of them can be made on a developer's machine.

Nobody developing on macOS can draw the Linux half, so a new case always
arrives with half its baselines missing. Playwright writes a missing one and
fails, deliberately — a new baseline is a change somebody should see.

`pnpm visual:accept` brings them back in one command: it finds the last run
whose **visual job** failed, downloads the artifact, and copies in only the
screenshots that differ from what is committed. (The job uploads the whole
directory, so without that comparison a six-file change reads as sixty.)

It stops short of committing. These images are what every later run is compared
against, and one nobody looked at is a test that passes for a reason nobody
chose. **Look at them, then commit.**

### Why the job does not just commit them itself

It did, briefly. A missing baseline is genuinely not a regression — it is a
picture of something never photographed here, so there is nothing it can
contradict — and the job adopted the untracked screenshots, pushed them to the
branch, and passed.

It left the pull request's head commit with **no checks at all**, because
GitHub does not trigger workflows for pushes made with `GITHUB_TOKEN`. A
meaningless red X traded for an unverified green is the worse of the two.

Doing it properly needs a token whose pushes do start a run — a personal access
token or a GitHub App — which is a credential decision rather than a code one.

## What a screenshot cannot see

`maxDiffPixelRatio` is 0.002, which on a full-page shot is nearly two thousand
pixels. A focus ring is about five hundred — so a full-page comparison cannot
see one at all, and deleting the ring from the product passes. A case that
exists to watch something small has to photograph it small: `clip` the shot to
the control, where the same five hundred pixels are a tenth of the picture.

`animations: "disabled"` fast-forwards transitions to their end, so nothing a
transition does on the way is ever in a baseline. A ring whose colour animates
from the wrong value is invisible to this suite, and belongs in a test that
reads computed style.

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
