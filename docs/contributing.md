# Contributing to Checkout Studio

**Version:** 1.0

**Status:** Engineering Process & Collaboration Guide

---

# Purpose

This document defines how work enters the Checkout Studio codebase.

It exists so that:

- A new engineer is productive on day one and trusted by week one.
- Every change arrives through the same reviewable, reversible path.
- Quality is a property of the process, not of individual diligence.
- Architectural decisions are recorded rather than rediscovered.
- Nothing reaches production that has not been typed, linted, tested, and reviewed.

This is the process document. The **standards** it enforces live in [coding-standards.md](./coding-standards.md), the structure it operates on in [monorepo-structure.md](./monorepo-structure.md), and the release path it feeds in [release-process.md](./release-process.md).

---

# Overview

```
Idea / Issue
     │
     ▼
Triage ──────────── needs a decision? ──▶ RFC
     │
     ▼
Branch
     │
     ▼
Implement ◀────────── local check loop
     │
     ▼
Pull Request
     │
     ▼
CI (blocking)
     │
     ▼
Review
     │
     ▼
Merge to develop
     │
     ▼
Deploy to development
     │
     ▼
Release train → staging → production
```

Every change follows this path. There is no fast lane except the documented hotfix procedure, and using it costs a retrospective.

---

# Architecture of the Process

Three loops, each with a different cost of failure.

```
┌─────────────────────────────────────────────────────────────┐
│  LOOP 1 — LOCAL          seconds                            │
│  editor · pnpm dev · pnpm check · git hooks                 │
│  Catches: syntax, types, lint, unit failures                │
│  Cost of failure: seconds                                   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LOOP 2 — PULL REQUEST   minutes                            │
│  CI · boundaries · coverage · bundle · a11y · audit         │
│  + human review                                             │
│  Catches: integration failures, design problems             │
│  Cost of failure: minutes to a day                          │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  LOOP 3 — RELEASE        hours                              │
│  staging · soak · readiness review · canary                 │
│  Catches: scale, performance, migration, real-traffic bugs  │
│  Cost of failure: customer impact                           │
└─────────────────────────────────────────────────────────────┘
```

Every automated check exists at the earliest loop that can run it.

Moving a check earlier is always worth the engineering effort, because the cost of a failure grows by roughly an order of magnitude at each stage.

---

# Design Principles

**The main branch is always shippable.**

Not "usually". If `main` is broken, fixing it takes priority over every other task in the repository.

**Small changes, reviewed quickly.**

A 200-line pull request receives a real review. A 2,000-line pull request receives an approval.

**The machine enforces what it can.**

Formatting, import order, layer boundaries, coverage, and bundle size are automated. Reviewers spend their attention on design, correctness, and clarity — the things a linter cannot judge.

**Decisions are written down.**

An architectural choice that lives only in a code review comment will be relitigated within six months.

**Documentation is part of the change.**

A feature that alters behavior described in `/docs` is not complete until those docs are updated in the same pull request.

**Disagreement is resolved by evidence.**

Benchmarks, profiles, spec citations, and user data — not seniority.

---

# Getting Started

## Prerequisites

```
Node.js      22 LTS
pnpm         9.x
PostgreSQL   16+
Redis        7+
Git          2.40+
```

Version managers are recommended; the repository pins Node via `.nvmrc` and pnpm via `packageManager`.

## Setup

```bash
git clone git@github.com:checkout-studio/checkout-studio.git
cd checkout-studio

# pnpm, if you do not already have it
corepack enable    # or: npm install -g pnpm@9

pnpm install

cp .env.example /dev/null 2>/dev/null; cp .env.example .env.local
# Fill in the values listed below, then run install again so each app is linked
# to the root environment file.
pnpm install

# From Phase 2 onward:
pnpm db:migrate
pnpm db:seed

pnpm dev
```

The Prisma client is generated during install, so a fresh clone typechecks
before you have a database. Run `pnpm db:generate` yourself only after editing
the schema.

One `.env.local` lives at the workspace root. `scripts/link-env.mjs` runs on install and symlinks it into each application, because Next reads that file from the application directory. The copy in `.env.example` is filled with correctly shaped placeholder values, so a fresh clone starts before you have real credentials.

Ports 3000 and 3001 must be free. `pnpm dev` fails fast if either is taken.

```
apps/studio     → http://localhost:3000
apps/renderer   → http://localhost:3001
```

## Environment Variables

These are replaced in Phase 3A, where the Clerk variables give way to
`AUTH_SESSION_SECRET`, `RESEND_API_KEY` and `EMAIL_FROM` — the schema validates
them, so they change together with the code that reads them.

`.env.example` is the authoritative list. Every variable is validated at startup by a Zod schema; a missing or malformed value fails fast with a precise message rather than producing a mysterious runtime error.

```
DATABASE_URL                      Local PostgreSQL
REDIS_URL                         Local Redis
CLERK_SECRET_KEY                  Clerk development instance
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
STRIPE_SECRET_KEY                 Test mode only (sk_test_…)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET             From `stripe listen`
UPLOADTHING_SECRET
UPLOADTHING_APP_ID
```

Rules

- Never commit `.env*` files. `.gitignore` covers them; do not work around it.
- Never use a live Stripe key locally. The environment validator rejects `sk_live_` outside production.
- Adding a variable means updating `.env.example`, the validation schema, and the deployment configuration in the same change.

## Stripe Locally

```bash
stripe login
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

Test cards

```
4242 4242 4242 4242    Success
4000 0000 0000 9995    Insufficient funds
4000 0027 6000 3184    Requires 3D Secure authentication
4000 0000 0000 0002    Generic decline
```

Webhook signature verification is enabled locally. Testing against a bypassed verifier means the production path is untested.

## Verifying Setup

```bash
pnpm check
```

Runs lint, typecheck, test, and build across the workspace. A green result means the environment is correct.

---

# Before You Start

## Read First

New engineers read, in order:

```
1. docs/README.md              orientation
2. docs/architecture.md        the system
3. docs/schema.md              the source of truth
4. docs/coding-standards.md    how we write code
5. docs/monorepo-structure.md  where code goes
```

Then whichever specification covers the area being changed.

## Claim the Work

```
Assign yourself the issue.
Comment your intended approach before writing code for anything non-trivial.
If the approach is contested, that conversation is cheaper now than in review.
```

## Does It Need an RFC?

Write an RFC when the change:

```
Introduces or removes a package
Alters the schema format
Changes a public API contract
Adds a runtime dependency to the renderer
Changes the plugin API
Affects payment handling
Introduces a new third-party service
Changes data retention or privacy behavior
Cannot be reversed easily
```

Everything else proceeds directly to a branch.

---

# RFC Process

```
docs/rfcs/NNNN-short-title.md
```

Copy [docs/rfcs/template.md](./rfcs/template.md). The index is [docs/rfcs/README.md](./rfcs/README.md).

Template

```markdown
# RFC NNNN — Title

**Status:** Draft | Under Review | Accepted | Rejected | Superseded
**Author:**
**Created:**
**Affects:** packages, docs, phases

## Summary

One paragraph.

## Motivation

The problem. Why the current design is insufficient.

## Proposal

The design, in enough detail to implement from.

## Alternatives Considered

What else was evaluated, and why it was not chosen.
An RFC with no alternatives has not been thought through.

## Migration

What happens to existing data, projects, and published pages.

## Risks

What could go wrong. What we would do about it.

## Open Questions
```

Flow

```
Draft → PR against docs/rfcs/ → discussion → decision
                                                │
                              ┌─────────────────┼──────────────┐
                              ▼                 ▼              ▼
                          Accepted          Rejected      Superseded
                              │                 │              │
                     implementation      recorded, kept   links forward
```

Rejected RFCs are merged, not deleted. "Why don't we just…" is a question that gets asked repeatedly, and a rejected RFC is the cheapest possible answer.

---

# Branching

```
main        Production. Protected. Merges from release/* or hotfix/* only.
develop     Integration. Protected. Default branch for feature work.
feature/*   One feature or fix.
hotfix/*    Urgent production fix. Branches from main.
release/*   Release stabilization.
docs/*      Documentation only.
```

This matches [deployment.md](./deployment.md).

## Naming

```
feature/editor-multi-selection
feature/renderer-embed-mode
fix/autosave-race-condition
docs/plugin-api-examples
chore/upgrade-prisma-6
hotfix/webhook-signature-validation
```

Include the issue number where one exists: `feature/312-multi-selection`.

## Scope

One branch, one concern.

If a branch needs "and" to describe it, split it. Unrelated refactoring inside a feature branch makes the feature harder to review and the refactor harder to revert.

---

# Commits

Conventional Commits, enforced by commitlint via a Husky hook.

```
<type>(<scope>): <subject>

[body]

[footer]
```

## Types

```
feat      A user-visible capability
fix       A bug fix
refactor  Behavior-preserving restructuring
perf      A measured performance improvement
docs      Documentation only
test      Tests only
chore     Tooling, dependencies, configuration
style     Formatting only, no logic change
revert    Reverts a prior commit
```

## Scopes

Every directory under `packages/`, `apps/` and `plugins/` is a valid scope —
commitlint reads them from the workspace, so a new package needs no change
here. Alongside them are the scopes that name a concern rather than a
directory:

```
checkout  stripe  auth  docs  repo  deps
```

## Examples

```
feat(editor): add box selection to the canvas

Implements drag-to-select using the existing selection slice.
Selection state stores ids only, per state-management.md.

Closes #312
```

```
fix(renderer): prevent hydration mismatch on conditional nodes

Visibility rules were evaluated on the client before the schema
context resolved, producing markup that differed from SSR output.
Evaluation now happens during the render pass.

Fixes #487
```

```
perf(editor): memoize style resolution by node and theme version

Reduces canvas re-render time on a 2,000-node project from
84ms to 11ms. Benchmark added.
```

Rules

- Subject in the imperative mood, under 72 characters, no trailing period.
- The body explains **why**, not what — the diff already says what.
- A `perf` commit without a number is a `refactor` commit.
- Breaking changes carry `BREAKING CHANGE:` in the footer.

---

# The Local Loop

```
        ┌──────────────┐
        │    Write     │
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │ pnpm dev     │  verify in the browser
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │ Write tests  │  failing test first for a bug fix
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │ pnpm check   │  lint · typecheck · test · build
        └──────┬───────┘
               ▼
             green? ──no──▶ back to Write
               │yes
               ▼
        ┌──────────────┐
        │   Commit     │  hooks run automatically
        └──────────────┘
```

## Scoping Commands

```bash
pnpm test --filter=@checkout-studio/editor
pnpm typecheck --filter=@checkout-studio/renderer...
pnpm test --filter=[origin/develop]        # only what your branch touched
pnpm test:e2e --filter=studio
```

## Git Hooks

```
pre-commit    lint-staged: eslint --fix, prettier on staged files
commit-msg    commitlint
pre-push      typecheck + affected unit tests
```

Hooks are a fast feedback loop, not a security boundary. `--no-verify` exists for genuine emergencies; CI will still block the merge, so using it only moves the failure later.

---

# Definition of Done

A change is complete when **all** of the following are true. This is the checklist from [testing.md](./testing.md), applied per pull request.

```
✓ The feature works, verified manually in the browser
✓ Types pass with strict mode, no `any`, no suppressions
✓ Lint passes with zero warnings
✓ Unit tests cover the new logic
✓ Integration tests cover the new interaction
✓ E2E tests cover the flow, if it is a critical path
✓ Coverage thresholds are met (90% general, 100% critical modules)
✓ Accessibility verified: keyboard, focus, ARIA, contrast
✓ Responsive verified at 1440 / 768 / 390
✓ Dark mode verified
✓ Performance budgets respected
✓ Errors handled per error-handling.md
✓ Telemetry added per observability.md
✓ Documentation in /docs updated
✓ No TODOs, no dead code, no commented-out blocks
✓ No console.log
✓ Self-reviewed before requesting review
```

"It works on my machine and I'll add tests later" is not a state this repository recognizes.

---

# Pull Requests

## Description Template

```markdown
## What

One paragraph. What changed and why.

## Related

Closes #123
RFC: docs/rfcs/0007-…

## Approach

Non-obvious decisions and why they were made.
Alternatives rejected.

## Testing

How this was verified. Include the manual steps if relevant.

## Screenshots / Recording

Required for any UI change. Light and dark. Desktop and mobile.

## Documentation

Which docs changed, or why none needed to.

## Risk

What could break. What the rollback looks like.

## Checklist

- [ ] Definition of Done met
- [ ] Docs updated
- [ ] No new dependencies (or justified below)
- [ ] No breaking schema change (or migration included)
```

## Size

```
Ideal        < 400 changed lines
Acceptable   < 800
Requires justification  > 800
```

Large mechanical changes — a rename, a codemod, a formatting sweep — are exempt but must be **only** that change, in their own pull request, with the command that generated them in the description.

## Draft Pull Requests

Open a draft early to get direction on approach before investing in polish. A draft signals "tell me if this is wrong", not "review this line by line".

## Required Checks

Merging is blocked until all pass.

```
lint                 zero warnings
typecheck            zero errors
test:unit            passing, coverage met
test:integration     passing
test:e2e             passing (critical flows)
build                all apps and packages
boundaries           no layer violations, no cycles
bundle-size          within budget
audit                no high or critical vulnerabilities
a11y                 axe passes on changed surfaces
```

Plus one approving review. Two for changes touching payments, authentication, the schema, or the plugin API.

---

# Code Review

## For the Author

**Review your own diff first.**

Reading it as a stranger catches most of what a reviewer would.

**Explain the non-obvious in the description, not in the review thread.**

If a decision needs defending, defend it before it is questioned.

**Respond to every comment.**

Fixed, or an explanation of why not. Silence stalls the review.

**Push fixes as new commits during review.**

Squash at merge. Force-pushing mid-review destroys the reviewer's ability to see what changed.

**Disagree with reasoning.**

"I chose X because Y, and Z would cost W" is a conversation. "That's just how I did it" is not.

## For the Reviewer

**Review within one business day.**

A stalled review blocks a person. If you cannot review today, say so and reassign.

**Distinguish severity.**

```
blocking:    must change before merge
suggestion:  worth considering, author decides
question:    I want to understand
nit:         cosmetic, non-blocking, use sparingly
praise:      say so when something is well done
```

Unlabeled comments read as blocking. Label them.

**Review the design, not the formatting.**

Prettier and ESLint have already handled the formatting. Spending review attention there wastes the scarce resource.

**Ask instead of asserting.**

"What happens if `nodes` is empty here?" beats "this will crash".

**Approve when it is better than what is there.**

Perfect is not the bar. Better, correct, and tested is the bar.

## What to Look For

```
Correctness       Edge cases, empty states, error paths, race conditions
Architecture      Right layer? Right package? Boundary respected?
Schema            Backward compatible? Migration included?
Security          Input validated? Ownership checked? Secrets contained?
Performance       Unnecessary re-renders? N+1 queries? Bundle growth?
Accessibility     Keyboard reachable? Focus visible? Labels present?
Errors            Typed? Classified? Actionable message?
Tests             Do they test behavior, or do they test implementation?
Naming            Would a stranger understand this in six months?
Docs              Does this change something /docs describes?
```

The questions from [coding-standards.md](./coding-standards.md) apply to every review:

> Is this readable? Reusable? Typed? Tested? Accessible? Performant? Can it be simplified? Does it introduce technical debt?

---

# Testing Expectations

Per [testing.md](./testing.md).

```
Every utility, hook, reducer, parser, validator    unit tested
Every UI component                                 rendering, props, events, a11y
Every store action                                 including undo and redo
Every API endpoint                                 auth, authz, validation, errors, ownership
Every bug fix                                      a regression test that fails before the fix
Critical flows                                     E2E
```

Critical modules requiring 100% coverage

The list is defined once, in the **Testing Standard** of [phases.md](./phases.md): `schema`, `renderer`, `plugin-sdk`, `editor/src/store`, and the `stripe`, `billing`, `publishing`, and `portability` services.

## Writing Good Tests

**Test behavior, not implementation.**

```ts
// Good — survives refactoring
expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled()

// Bad — breaks when the internals change
expect(wrapper.state.isPublishDisabled).toBe(true)
```

**Name the scenario.**

```ts
it("restores the previous selection when an undo reverts a delete", …)
```

**One assertion concept per test.**

Ten assertions of one behavior is fine. One assertion each of ten behaviors is ten tests.

**Never mock what you own.**

Mock Stripe. Mock the network. Do not mock `@checkout-studio/schema` — if it is too awkward to use in a test, it is too awkward to use in production.

---

# Documentation

Documentation is code that happens to be prose.

## When to Update

```
Behavior described in /docs changed        → update that document
New capability                             → document it before merging
New package                                → README + monorepo-structure.md entry
Schema change                              → schema.md + migration table
API change                                 → api-spec.md
New error code                             → error-handling.md catalog
New shortcut                               → keyboard-shortcuts.md
New telemetry event                        → observability.md namespace
```

## Style

Match the existing documents.

```
Short lines. Generous whitespace.
ASCII diagrams over prose descriptions of structure.
TypeScript interfaces over paragraphs describing shapes.
Tables for enumerable facts.
Every document carries the standard section set.
Cross-reference with relative markdown links.
```

## Code Comments

Comments explain **why**. The code already explains what.

```ts
// Bad
// Increment the counter
count++

// Good
// Nudges arriving within one frame are coalesced so that holding an
// arrow key produces a single history entry rather than sixty.
```

Delete commented-out code. Git remembers it; the file should not.

---

# Dependencies

Adding a runtime dependency is a long-term commitment. Treat it as one.

## Before Adding

```
Can this be 30 lines of our own code?
Is it actively maintained? Last release within 12 months?
What is the bundle cost? (bundlephobia)
How many transitive dependencies does it bring?
Is the license compatible? (MIT, Apache-2.0, BSD)
Does it have a security history?
Is there a lighter alternative already in the tree?
```

## Rules

```
Direct dependencies pinned exactly
Justification required in the pull request description
Renderer dependencies require a second approval
Dev dependencies held to a lower bar, but still reviewed
Duplicate-purpose libraries rejected — one of each kind
```

Already chosen, and not to be relitigated without an RFC

```
State        Zustand + Immer
Forms        React Hook Form + Zod
DnD          dnd-kit
Animation    Framer Motion
Icons        Lucide
Styling      Tailwind CSS
UI base      shadcn/ui
ORM          Prisma
Testing      Vitest, React Testing Library, Playwright
```

Mixing a second icon set or a second animation library is a review rejection, per [coding-standards.md](./coding-standards.md).

## Maintenance

```
Weekly    Automated dependency PRs, batched by risk
Weekly    pnpm audit in CI
Monthly   Major version review
Immediate Critical vulnerabilities
```

---

# Working with the Schema

The schema is load-bearing for every published checkout in existence. Changes to it are handled with corresponding care.

## Backward Compatible (no migration)

```
Adding an optional property
Adding a component type
Adding a style property
Adding a theme token
```

## Breaking (migration required)

```
Renaming or removing a property
Changing a property's type
Changing structural relationships
Changing default semantics
```

## Procedure

```
1. RFC, if the change is structural
2. Bump the schema version
3. Write a forward migration
4. Add fixtures for both versions
5. Verify the renderer handles both
6. Verify import handles both (see export-import.md)
7. Update schema.md and the migration table
8. Two approvals required
```

Migrations are append-only and never edited after merge. Published revisions in production depend on their exact behavior.

---

# Performance Work

Per [performance.md](./performance.md):

> Never optimize without measurement.

## Procedure

```
1. Reproduce with a realistic project (2,000 nodes, 100 sections)
2. Profile — React Profiler, Chrome Performance, Lighthouse
3. Identify the actual bottleneck, not the suspected one
4. Record the baseline number
5. Change one thing
6. Measure again
7. Include both numbers in the pull request
8. Add a benchmark so the improvement cannot silently regress
```

A `perf` pull request without before and after numbers will be asked for them.

## Budgets

Enforced in CI, not by convention.

```
apps/renderer     target 150 KB gzipped    warn at 150, fail at 175
apps/studio       target 250 KB gzipped    warn at 250, fail at 350
Editor FPS        60                   benchmark suite
API p50           < 200 ms             staging soak
```

---

# Accessibility Work

Accessibility is a requirement, not a phase. Per [coding-standards.md](./coding-standards.md), every interactive component ships with keyboard support, focus states, ARIA, semantic HTML, and adequate contrast.

## Verification

```
Tab through the entire feature. Can everything be reached?
Is focus visible at every stop?
Is focus order logical?
Does Escape always exit?
Does it work with VoiceOver or NVDA?
Does axe report zero violations?
Does it survive prefers-reduced-motion?
Does it survive 200% zoom?
Is contrast at least AA?
```

Automated checks catch roughly half of real accessibility problems. The manual pass is not optional.

---

# Security Practices

Per [security.md](./security.md).

## Every Pull Request

```
Is every input validated with Zod before use?
Is ownership verified on every data access?
Are secrets confined to server code and never to a package?
Is user content escaped or sanitized before rendering?
Are errors sanitized before leaving the server?
Are new endpoints rate limited?
Are sensitive operations audit logged?
```

## Reporting a Vulnerability

Do not open a public issue.

```
security@checkoutstudio.com

Include: description, reproduction, impact, and any suggested fix.
Acknowledgement within 24 hours.
Assessment within 72 hours.
```

Responsible disclosure is credited in release notes with the reporter's permission.

---

# Phase Discipline

The roadmap in [roadmap.md](./roadmap.md) defines ordered phases; [phases.md](./phases.md) defines how to execute each one and when it is complete.

The project rule is explicit:

> Complete one phase at a time and stop for review before continuing.

Consequences for contributors

```
Work belongs to the current phase unless explicitly scheduled otherwise.
A phase is not complete until its Definition of Done is met in full.
Scope creep across phase boundaries is rejected in review.
Future-phase work is captured as an issue, not implemented early.
```

This applies equally to human and AI-assisted contributions.

---

# AI-Assisted Contributions

Claude Code is a contributor here, operating under [CLAUDE.md](../CLAUDE.md).

Rules

```
AI-generated code is held to exactly the same standard as any other.
The submitting engineer owns it, understands it, and can defend it in review.
"The AI wrote it" is not an explanation of a design decision.
AI-authored changes follow the identical branch, test, review, and merge path.
Generated tests are reviewed for whether they assert anything meaningful.
The AI stops at phase boundaries and waits for confirmation.
```

Attribution follows the repository's commit convention. Ownership does not transfer.

---

# Internal Structure

Where the process itself lives in the repository.

```
.github/
├── workflows/
│   ├── ci.yml                 lint · typecheck · test · build
│   ├── e2e.yml                Playwright, critical flows
│   ├── boundaries.yml         layer rules + dependency-cruiser
│   ├── bundle-size.yml        budget enforcement
│   ├── a11y.yml               axe on changed surfaces
│   ├── audit.yml              pnpm audit
│   └── release.yml            tag, changelog, deploy
├── PULL_REQUEST_TEMPLATE.md
├── ISSUE_TEMPLATE/
│   ├── bug.yml
│   ├── feature.yml
│   └── security.md            redirects to security@
└── CODEOWNERS                 review routing per package

.husky/
├── pre-commit                 lint-staged
├── commit-msg                 commitlint
└── pre-push                   typecheck + affected tests

docs/
├── rfcs/                      architectural decisions
│   ├── 0001-….md
│   └── template.md
└── compatibility.md           app / schema / renderer / plugin matrix

scripts/
├── create-package.ts          generates a package wired to the layer model
├── create-plugin.ts           generates a plugin with split renderer/editor entries
├── verify-boundaries.mjs      declared dependencies obey the layer model
└── link-env.mjs               links the root .env.local into each app (runs on install)
```

`CODEOWNERS` routes reviews by package, which is what makes the two-approval rule on payments, authentication, the schema, and the plugin API automatic rather than remembered.

---

# Workflows

## Fixing a bug

```
Reproduce it
Write a failing test that captures it
Fix it
Watch the test pass
Look for the same mistake elsewhere in the codebase
pnpm check
PR: fix(scope): …  · Fixes #NNN
```

The failing-test-first order matters. A test written after the fix frequently tests the fix rather than the bug.

## Adding a component to the library

```
Read component-library.md for the specification
Create the definition / Renderer / properties triple in the owning plugin
Define default props, default styles, and validation rules
Register in the component registry
Declare editable properties in properties.ts — the inspector generates itself from them
Test: rendering, props, variants, keyboard, a11y, responsive
Verify in the editor and in a published preview
Update component-library.md
```

## Adding an API endpoint

```
Define contracts in packages/api/src/contracts
Implement the handler in packages/api/src/handlers
Implement the service in packages/api/src/services
Wrap with auth, rate limit, validation, telemetry, error handling
Export from the route file in apps/studio (three lines)
Test: auth, authz, validation, success, every error, ownership, rate limit
Update api-spec.md
```

## Onboarding week one

```
Day 1   Setup, run everything locally, read the core five docs
Day 2   Read the specification for your area, trace one flow end to end
Day 3   Fix a small bug. Full pipeline: branch, test, PR, review, merge
Day 4   Review someone else's PR. Reviewing teaches faster than writing
Day 5   Take a real issue
```

The day-three requirement is deliberate. Shipping something small immediately teaches the process while it still has attention to spare.

---

# Best Practices

**Push early, push often.**

A visible branch is a branch someone can help with.

**Keep the branch fresh.**

Rebase on `develop` daily. A week-old branch is a merge conflict with a schedule.

**Leave it better.**

Fix the adjacent typo. Do not refactor the adjacent module — that is a separate pull request.

**Ask on day one.**

Two hours stuck is normal. Two days stuck is a process failure, and it is the team's failure, not yours.

**Write the test you wish had existed.**

Every bug is evidence of a missing test.

**Optimize for the reader.**

Code is read far more often than it is written, and increasingly by someone who was not there.

**Update the doc in the same PR.**

Documentation updated later is documentation updated never.

**Revert without ego.**

A revert is a normal operation, not a verdict. Revert first, diagnose second.

---

# Performance of the Process Itself

A slow process produces batched, large, risky changes. The process has targets too.

| Stage                      | Target           |
| -------------------------- | ---------------- |
| Local `pnpm check`         | < 3 min          |
| CI pipeline                | < 8 min          |
| First review response      | < 1 business day |
| PR open → merged           | < 3 days         |
| Merge → development deploy | < 10 min         |
| Hotfix → production        | < 60 min         |

When these slip, the fix is process work, not exhortation.

---

# Future Expansion

The process is designed to scale with the team without being rewritten.

**Team growth.**

`CODEOWNERS` already routes reviews by package. Adding a team means adding ownership entries, not changing the workflow.

**Multiple release trains.**

The branch model supports parallel `release/*` branches when product lines diverge, arriving naturally with Phase 22.

**External contributors.**

Fork-based pull requests, a contributor licence agreement, and a restricted CI profile for untrusted branches. The gates are already the same for everyone.

**Plugin marketplace contributions.**

Third-party plugins follow this process with an added security review and sandbox verification, per [plugin-api.md](./plugin-api.md).

**Automated changelog and versioning.**

Conventional commits are already enforced, so changesets or a similar tool can be adopted without changing how anyone writes commits.

**Formal RFC review board.**

The RFC format already carries status and authorship; adding a scheduled review cadence is a process change, not a format change.

**Contribution metrics.**

Lead time, review latency, and change failure rate feed from the same data described in [release-process.md](./release-process.md).

---

# Success Criteria

The process is successful when:

- A new engineer ships a reviewed change within three days of starting.
- `develop` and `main` are green essentially all of the time.
- The median pull request is under 400 lines and merges within three days.
- Every architectural decision of consequence has a written RFC.
- No change reaches production without types, lint, tests, and review.
- Documentation and code never disagree for longer than one pull request.
- Reviews discuss design, because everything mechanical was already automated.
- Reverting is routine and uneventful.

---

# Philosophy

Process exists to make good work the path of least resistance.

Every rule here removes a decision someone would otherwise have to make under time pressure: what to name the branch, whether the test is necessary, whether the doc can wait, whether this is worth a review. Automating the mechanical parts is what preserves human attention for the parts that genuinely need judgment.

The goal is not compliance. It is a codebase where a stranger can arrive, find their way to the right file, understand why it looks the way it does, change it safely, and know that if they are wrong, someone will catch it before a customer does.

Write code your future colleagues will thank you for.

They are the ones who will maintain it, and one of them will be you.
