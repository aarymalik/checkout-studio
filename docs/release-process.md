# Checkout Studio Release Process

**Version:** 1.0

**Status:** Release Engineering & Change Management

---

# Purpose

A release is the moment a change stops being ours and starts being the customer's.

For a platform that hosts live checkout pages, a bad release does not merely inconvenience users — it stops other businesses from taking money. That asymmetry shapes everything below.

This document defines:

- How code travels from a merged pull request to production.
- What must be true before each promotion, and who decides.
- How versions are assigned across a monorepo with four independently versioned contracts.
- How a release is verified, monitored, and — when necessary — reversed.
- How urgent fixes reach production without abandoning the safeguards.

Deployment mechanics live in [deployment.md](./deployment.md). This document is about the **decision process** layered on top of them.

---

# Overview

```
   develop                main                 tag
      │                    │                    │
 ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
 │  DEV    │──────────│ STAGING │──────────│  PROD   │
 │ auto    │  release │  auto   │ approval │ manual  │
 │ on merge│  branch  │ on merge│    +     │ gated   │
 │         │          │  soak   │  checks  │         │
 └─────────┘          └─────────┘          └─────────┘
      │                    │                    │
   minutes              4 hours              canary
                                            10% → 50% → 100%
                                                 │
                                          30 min watch
                                                 │
                                        ┌────────┴────────┐
                                        ▼                 ▼
                                     stable           rollback
```

Three gates, each stricter than the last.

Nothing skips a gate except a hotfix, and a hotfix skips only the schedule — never the checks.

---

# Architecture of the Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│  SOURCE                                                      │
│  feature/* → develop → release/* → main → tag                │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  BUILD          one immutable artifact per release           │
│  built once, promoted three times, never rebuilt             │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  VERIFY                                                      │
│  CI → extended suite → staging → soak → readiness review     │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  PROMOTE                                                     │
│  approval → migrations (expand) → canary 10/50/100           │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  OBSERVE                                                     │
│  release marker → metric comparison → stable or rollback     │
└──────────────────────────────────────────────────────────────┘
```

Two properties make the whole pipeline reversible.

**The artifact is immutable.** What was verified in staging is what runs in production, byte for byte. Rolling back is redeploying an artifact that already exists.

**Migrations are expand-only within a release.** The database is compatible with both the old and new code at every moment, so a rollback never requires touching data.

Everything else in this document follows from those two decisions.

---

# Design Principles

**Releases are boring.**

Excitement during a release means the process failed earlier. A release should be the least interesting part of the week.

**Small and frequent beats large and rare.**

A weekly release contains five days of risk. A quarterly release contains a quarter of it, correlated, and nobody remembers what is in it.

**Every release is reversible.**

If a change cannot be rolled back, it is not ready to ship — it needs a migration strategy first.

**Forward and backward compatible, always.**

During a deployment, old code and new code run simultaneously. Every change must tolerate that.

**Automate the decision inputs, keep the decision human.**

Machines verify. People approve. Production deploys are never fully automatic.

**Published checkouts are sacred.**

A published revision must render identically before and after a release. Renderer changes are held to a higher standard than anything else in the system.

**Roll back first, diagnose second.**

Restoring service is the priority. Understanding is important, but it is not urgent in the same way.

---

# Versioning

Four things version independently in this repository. Conflating them is how compatibility breaks quietly.

```
1. Application version     What users are running          1.4.2
2. Schema version          Checkout document format        2.0.0
3. Renderer version        Rendering engine contract       1.3.0
4. Plugin API version      Plugin contract surface         1.1.0
```

## Application Version

Semantic versioning, per [deployment.md](./deployment.md).

```
MAJOR   Breaking change to a user-facing contract or data model
MINOR   New capability, backward compatible
PATCH   Bug fix, backward compatible
```

The application version corresponds to a git tag and a deployed build. It is what appears in the health endpoint and in error reports.

## Schema Version

The most consequential version in the system, because published revisions carry it forever.

```
MAJOR   Breaking structural change. Migration mandatory.
MINOR   New optional capability. Old documents remain valid.
PATCH   Clarification or validation fix. No document changes.
```

Rules

```
The renderer supports every MAJOR version ever published. There is no sunset.
Migration is forward-only.
Every revision stores the schema version it was written against.
Migration runs at load time and never mutates the stored revision.
```

This is the contract described in [schema.md](./schema.md), and it is why a checkout published in year one still renders in year five.

## Renderer Version

Declared by templates and bundles as a semver range.

```
MAJOR   A component's rendered output changes materially
MINOR   New component or new capability
PATCH   Bug fix producing identical output
```

Templates declare compatibility as `>=1.2.0`, per [template-system.md](./template-system.md). Bundles declare it in the manifest, per [export-import.md](./export-import.md).

## Plugin API Version

Plugins declare minimum and maximum supported editor versions. An incompatible plugin is disabled automatically rather than loaded and left to fail, per [plugin-api.md](./plugin-api.md).

## Compatibility Matrix

Maintained in `docs/compatibility.md` and updated with every release that touches a contract.

```
App      Schema   Renderer   Plugin API   Notes
1.4.x    1.0–2.0  1.3.x      1.1.x        current
1.3.x    1.0–1.1  1.2.x      1.0.x        supported
1.2.x    1.0–1.1  1.1.x      1.0.x        security fixes only
```

---

# Release Cadence

```
Regular releases      Tuesday and Thursday, 10:00 local
Patch releases        as needed, same gates
Hotfixes              any time, expedited path
Major releases        scheduled, announced two weeks ahead
```

## Freeze Windows

No production deployment during

```
Friday after 14:00 through Monday 09:00
The 24 hours before and after a major shopping event
   (Black Friday, Cyber Monday, Boxing Day)
Any active P1 incident
Any period with an exhausted SLO error budget
```

Freeze windows exist because the cost of a bad release is proportional to how long it takes to notice and how many people are available to fix it. Hotfixes for active incidents are always permitted; a freeze restricts planned change, not repair.

---

# Release Flow

## Stage 1 — Development

```
PR merged to develop
        ↓
CI: lint · typecheck · test · e2e · build · boundaries · bundle · audit
        ↓
Automatic deploy to the development environment
        ↓
Smoke tests
        ↓
Available to the team within ~10 minutes
```

Purpose: continuous integration. Anyone can break `develop` briefly; nobody may leave it broken.

## Stage 2 — Release Branch

```
Release manager cuts release/1.4.0 from develop
        ↓
Version bumped, changelog generated
        ↓
PR opened: release/1.4.0 → main
        ↓
Full CI plus the extended suite:
   • visual regression
   • accessibility across every changed surface
   • performance benchmarks
   • Lighthouse
   • migration verification against a production-shaped dataset
        ↓
Review and approval
        ↓
Merge to main
```

The release branch is where stabilization happens. Only fixes for issues found during verification may be merged into it. New features wait for the next train — this is the rule that keeps the release from expanding indefinitely while it is being tested.

## Stage 3 — Staging

```
Merge to main triggers an automatic staging deploy
        ↓
Migrations applied to staging
        ↓
Automated smoke suite
        ↓
Manual QA checklist
        ↓
4-hour soak with monitoring
        ↓
Release readiness review
```

Staging runs production configuration against test-mode Stripe. It is the last environment where a mistake is free.

### Soak

Four hours of synthetic traffic against staging, watching

```
Error rate            must remain at baseline
API p50               < 200 ms, p95 < 500 ms
Editor load p95       < 2 s
Memory                stable, no upward drift
Database connections  stable
Web Vitals            within targets
```

The soak exists to catch what a test suite cannot: slow leaks, connection exhaustion, cache degradation, and anything that only appears after the thousandth request.

## Stage 4 — Production

```
Release readiness review passes
        ↓
Manual approval (release manager + on-call engineer)
        ↓
Tag v1.4.0, immutable build promoted — the exact artifact from staging
        ↓
Migrations applied (expand phase only)
        ↓
Canary: 10% of traffic
        ↓
        10 minutes ── regression? ──▶ rollback
        ↓
Canary: 50%
        ↓
        10 minutes ── regression? ──▶ rollback
        ↓
Full: 100%
        ↓
30-minute active watch
        ↓
Release marked stable
```

The staging artifact is promoted, not rebuilt. Rebuilding introduces the possibility that what was verified is not what shipped.

---

# Release Readiness Review

A short, structured checkpoint before production. It is a conversation, not a form — but the form guarantees the conversation covers everything.

```
CODE
  ✓ All CI checks green on the release commit
  ✓ No known P1 or P2 defects open against this release
  ✓ Every change reviewed and approved
  ✓ No commits added to the release branch in the last hour

TESTING
  ✓ Unit, integration, and E2E suites passing
  ✓ Coverage thresholds met
  ✓ Visual regression reviewed; every diff intentional
  ✓ Accessibility: axe clean, manual keyboard pass done
  ✓ Manual QA checklist complete

DATABASE
  ✓ Migrations reviewed by a second engineer
  ✓ Migrations tested against a production-shaped dataset
  ✓ Migrations are expand-only for this release
  ✓ Rollback path verified
  ✓ Backup taken within the last hour

PERFORMANCE
  ✓ Bundle budgets respected (renderer target 150 KB, studio target 250 KB)
  ✓ Lighthouse ≥ 95 on the published checkout
  ✓ Benchmarks show no regression
  ✓ Soak completed with no drift

PAYMENTS
  ✓ Stripe test-mode flow verified end to end
  ✓ Webhook signature verification confirmed working
  ✓ Order creation verified
  ✓ Refund path verified
  ✓ No change to payment logic without a second approval

RENDERER
  ✓ Published-page rendering unchanged for a fixture corpus
  ✓ Every supported schema version renders correctly
  ✓ Hydration produces no mismatches

SECURITY
  ✓ pnpm audit clean of high and critical
  ✓ No new secrets in the codebase
  ✓ CSP validated
  ✓ Security headers verified
  ✓ New endpoints authenticated, authorized, rate limited

OBSERVABILITY
  ✓ New code paths instrumented
  ✓ Alerts configured for new failure modes
  ✓ Dashboards updated
  ✓ Release marker will be emitted

OPERATIONS
  ✓ Rollback plan written and understood
  ✓ On-call engineer identified and available
  ✓ Not inside a freeze window
  ✓ SLO error budgets healthy
  ✓ Customer communication prepared, if user-visible
  ✓ Documentation merged
```

Any unchecked item stops the release. There is no partial approval — the whole point of a gate is that it is binary.

---

# Database Migrations

Migrations are the only genuinely irreversible part of a release. They are handled with corresponding care.

## Expand / Contract

Every schema change is split across at least two releases.

```
RELEASE N — EXPAND
   Add the new column, nullable, with a default
   Deploy code that writes both old and new
   Backfill in the background
   Old code continues to work unchanged

RELEASE N+1 — MIGRATE
   Deploy code that reads the new column
   Verify parity between old and new

RELEASE N+2 — CONTRACT
   Remove writes to the old column
   Drop the old column
```

The reason is simple: during any deployment, both versions of the code are running against one database. A rename applied in a single release breaks whichever version loses the race.

## Rules

```
Never rename in a single release
Never drop a column in the same release that stops using it
Never add a NOT NULL column without a default
Never apply a long-running migration during peak traffic
Always index concurrently on large tables
Always take a backup immediately before applying
Always review with a second engineer
Always test against a production-shaped dataset
```

## Procedure

```
Backup verified
        ↓
Apply to staging → verify → soak
        ↓
Estimate production duration from the staging run
        ↓
Duration > 30s? Schedule for a low-traffic window
        ↓
Apply to production with a statement timeout
        ↓
Verify integrity
        ↓
Deploy application code
        ↓
Monitor query performance for 30 minutes
```

A migration that cannot be applied without downtime is redesigned, not scheduled.

---

# Schema Migrations

Distinct from database migrations: these transform **checkout documents**, not tables.

```
Renderer loads a revision written against schema 1.1.0
        ↓
Current supported version is 2.0.0
        ↓
Migration chain applied in memory: 1.1.0 → 2.0.0
        ↓
Validated
        ↓
Rendered
        ↓
The stored revision is never modified
```

Release requirements

```
✓ A migration exists for every version gap
✓ Fixtures exist for every prior version
✓ The full corpus migrates and renders identically
✓ Migration performance measured (< 50 ms for a typical page)
✓ Rollback safety confirmed: the previous release can still render
    every document the new one can produce
```

That last check is the one people forget. If release N writes a document that release N−1 cannot read, the release is no longer reversible — a rollback would break every page saved in between.

---

# Feature Flags

Flags decouple deployment from release, which is what makes large changes shippable in small pieces.

```ts
export interface FeatureFlag {
  key: string
  description: string
  defaultValue: boolean
  rollout: {
    strategy: "off" | "internal" | "percentage" | "allowlist" | "on"
    percentage?: number
    userIds?: string[]
    plans?: string[]
  }
  /** Flags without an owner and a removal date become permanent by accident. */
  owner: string
  createdAt: string
  removeBy: string
  killSwitch: boolean
}
```

Rollout ladder

```
off → internal → 5% → 25% → 50% → 100% → remove the flag
```

Rules

```
Every experimental feature ships behind a flag, per deployment.md
Every flag has an owner and a removal date
Flags are removed within 60 days of reaching 100%
A flag evaluation failure defaults to the safe path (off)
Payment-affecting flags carry a kill switch that requires no deploy
Flag state changes are audit logged
```

A codebase with fifty live flags has fifty untested combinations. Removing flags is part of finishing a feature, not optional cleanup.

---

# Canary Deployment

```
                    100% traffic
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         90% stable            10% canary
         v1.3.9                v1.4.0
              │                     │
              └──────────┬──────────┘
                         ▼
              Compare, continuously
```

Compared metrics

```
Error rate                canary must not exceed stable + 0.5%
API p95                   must not exceed stable + 20%
Payment success rate      must not fall below stable − 0.5%
Editor load p95           must not exceed stable + 20%
Web Vitals p75            must remain within target
Client error rate         must not exceed stable + 0.5%
```

Any breach triggers an automatic rollback and pages the on-call engineer. Automatic rollback exists because a human comparing dashboards at 10:15 on a Tuesday will always be slower than a threshold.

Canary is skipped only for documentation-only releases and configuration changes with no code delta.

---

# Post-Release Monitoring

```
0–5 min      Deployment health, error rate, health endpoint
5–15 min     API latency, database load, cache hit rate
15–30 min    Payment success, publish success, autosave success
30–60 min    Web Vitals, editor performance, memory
1–24 h       Support volume, conversion rate, SLO burn
24 h         Release retrospective if anything was notable
```

Watched signals, per [observability.md](./observability.md)

```
Error rate by code
Payment success rate
Order creation success rate
Webhook lag
Publish success rate
Autosave failure rate
Renderer fallback rate
Editor load time p95
Checkout availability
```

The release marker is emitted at deploy time and appears on every dashboard, so any regression is immediately visually correlated with the change that caused it.

---

# Rollback

## Decision Criteria

Roll back immediately, without discussion, when

```
Payment success rate drops more than 1%
Any order creation failure attributable to the release
Any data integrity issue
Error rate exceeds 2× baseline
Checkout availability drops below 99.9%
Any P1 incident traced to the release
```

Discuss, then decide, when

```
Non-critical feature regression
Performance degradation under 20%
Cosmetic issues
Isolated user reports
```

The bias is toward rolling back. A rollback costs a day of work. A bad release live for four hours costs customers their revenue.

## Procedure

```
1. Declare. Announce in the incident channel. One person owns the decision.
2. Redeploy the previous immutable build. Target: under 5 minutes.
3. Verify health checks and error rate return to baseline.
4. Decide on the database:
      Expand-only migration  → leave it. It is compatible by construction.
      Anything else          → follow the documented reversal plan.
5. Disable related feature flags.
6. Communicate to affected customers.
7. Confirm recovery across all key metrics.
8. Write the incident report within 24 hours.
```

Because migrations are expand-only within a release, the database almost never needs to be touched during a rollback. That property is the entire reason for the expand/contract discipline.

## Forward Fix Instead

Roll forward only when

```
The fix is trivial and obvious
It is fully tested
The rollback would itself be risky
The impact is low and contained
```

Otherwise roll back. Debugging under production pressure is how a small incident becomes a large one.

---

# Hotfix Process

For P1 issues that cannot wait for the next train.

```
Incident declared
        ↓
hotfix/1.4.1-webhook-validation branched from main
        ↓
Minimal fix — the smallest change that resolves the issue
        ↓
Test added covering the failure
        ↓
Full CI (never skipped)
        ↓
Two approvals, one from on-call
        ↓
Staging deploy + abbreviated verification (15 min, not 4 hours)
        ↓
Production deploy, canary compressed to 5 minutes per stage
        ↓
Monitor
        ↓
Merge back into develop immediately
        ↓
Incident report within 24 hours
```

Rules

```
A hotfix fixes exactly one thing
No refactoring, no cleanup, no "while I'm here"
CI is never bypassed
The merge back to develop happens the same day — a forgotten
   backport means the bug returns with the next release
Target: incident declared → production, under 60 minutes
```

The hotfix path compresses time, not rigor. Everything that gets skipped is waiting, never verification.

---

# Changelog

Generated from conventional commits, then edited by a human.

```markdown
# 1.4.0 — 2026-09-01

## Added

- Box selection on the canvas (#312)
- Dark mode for published checkouts (#340)
- Paste styles only, ⌘⌥V (#355)

## Changed

- Editor load is 40% faster on projects over 1,000 nodes (#348)
- Order Summary now shows per-item tax when configured (#351)

## Fixed

- Hydration mismatch on conditionally visible nodes (#487)
- Autosave no longer retries indefinitely while offline (#492)

## Schema

- 1.1.0 → 2.0.0. Automatic migration. No action required.

## Deprecated

- `checkout.order-bump-v1`. Use `checkout.order-bump`. Hidden from the component library in 2.0.0; pages that already use it keep rendering it indefinitely.

## Security

- Upgraded dependency addressing CVE-2026-XXXXX
```

Rules

```
Written for users, not for engineers
Every user-visible change appears
Internal refactors do not
Breaking changes lead, with migration instructions
Security fixes credited to reporters who consent
```

Generated changelogs read like commit logs, which is to say they read like nothing at all. The human edit is what makes them worth publishing.

---

# Communication

## Internal

```
Release scheduled       48 hours ahead
Release starting        at deploy time
Release complete        with the changelog
Rollback                immediately, with impact
Incident                real time in the incident channel
```

## External

| Change                | Notice                                      |
| --------------------- | ------------------------------------------- |
| New feature           | In-app announcement at release              |
| Breaking API change   | 90 days, email + docs + deprecation headers |
| Schema major version  | 30 days, though migration is automatic      |
| Deprecation           | 90 days minimum before removal              |
| Planned maintenance   | 7 days                                      |
| Emergency maintenance | As soon as known                            |
| Security fix          | After patches are deployed                  |
| Incident              | Status page within 15 minutes               |

## Deprecation Policy

```
Announce
   ↓  90 days minimum
Warn in-product and in API responses
   ↓
Migration guide published, with a tool where feasible
   ↓
Remove in the next MAJOR release
```

Nothing user-facing is ever removed without a deprecation period. A published checkout that breaks because we retired a component is a broken promise, not a version bump.

---

# Release Roles

```
Release Manager      owns the train, runs the readiness review, makes the call
On-call Engineer     watches the deploy, holds rollback authority
Reviewers            approve the release PR
QA Owner             owns the manual checklist
Incident Commander   assumes control if the release becomes an incident
```

The release manager rotates weekly. Rotation spreads knowledge of the process and prevents a single person from becoming the only one who can ship.

Rollback authority sits with on-call, not with the release manager. The person watching the graphs should not need permission to act on them.

---

# Environments Recap

Per [deployment.md](./deployment.md).

| Environment | Branch    | Deploy          | Stripe | Data              | Purpose      |
| ----------- | --------- | --------------- | ------ | ----------------- | ------------ |
| Local       | any       | manual          | test   | local             | development  |
| Development | `develop` | automatic       | test   | shared dev        | integration  |
| Staging     | `main`    | automatic       | test   | production-shaped | verification |
| Production  | tag       | manual + canary | live   | production        | customers    |

Staging must be production-shaped, not production-sized-down. A migration that takes 200 ms against 1,000 rows and 40 minutes against 10 million rows is a discovery best made before production.

---

# Internal Structure

```
.github/workflows/
├── ci.yml                  runs on every push
├── release-branch.yml      extended suite on release/*
├── release.yml             tag, changelog, artifact promotion
├── deploy-staging.yml      automatic on main
├── deploy-production.yml   manual approval + canary orchestration
└── rollback.yml            one-click redeploy of a prior artifact

docs/
├── compatibility.md        app / schema / renderer / plugin matrix
├── CHANGELOG.md            user-facing, human-edited
└── runbooks/                   one page per alert — see docs/runbooks/README.md
    ├── rollback.md             authored in Phase 21, alongside the alerts
    ├── migration-failure.md
    ├── payment-incident.md
    ├── webhook-backlog.md
    └── canary-failure.md

scripts/
├── cut-release.ts          version bump + changelog draft
├── verify-migration.ts     dry run against a production-shaped dataset
├── compare-canary.ts       metric comparison + rollback trigger
└── promote-artifact.ts     staging build → production
```

Every alert in [observability.md](./observability.md) links to a runbook in `docs/runbooks/`. An alert without one is not considered configured.

---

# Future Expansion

**Progressive delivery by segment.**

Rolling out by plan, region, or project size rather than by traffic percentage. The canary comparison already segments metrics; only the routing rule changes.

**Automated release notes from issues.**

Linking merged pull requests to their issues to draft user-facing notes, still human-edited before publication.

**Independent package versioning.**

If `@checkout-studio/renderer`, `schema`, or `plugin-sdk` are published externally, they gain their own release cadence. The version model already treats them as separate contracts.

**Shadow traffic.**

Replaying production requests against a candidate build before any real traffic reaches it.

**Automated rollback on SLO burn.**

Extending the canary comparison to run through the full watch window, not only during the ramp.

**Multi-region deployment.**

Region-by-region promotion with independent rollback, reusing the canary comparison per region.

**Customer-facing release calendar.**

Publishing the schedule and deprecation timeline, driven by the same data as the internal one.

---

# Metrics

Release health is measured. Process improvement follows the numbers.

```
Deployment frequency         target: 2+ per week
Lead time (merge → prod)     target: < 3 days
Change failure rate          target: < 5%
Mean time to recovery        target: < 30 minutes
Rollback rate                target: < 5%
Hotfix rate                  target: < 1 per month
Failed canaries              tracked, investigated
Release readiness pass rate  target: > 90% first attempt
```

A rising change failure rate means the gates are not catching what they should. A falling deployment frequency means the process has grown heavy enough that people batch changes to avoid it — which increases risk rather than reducing it.

Both are process defects, and both are addressed as engineering work.

---

# Security Considerations

**The artifact is immutable.**

The build verified in staging is the build promoted to production. Rebuilding invalidates the verification.

**Provenance.**

Build artifacts carry attestation: commit SHA, builder identity, dependency lockfile hash. A production deployment can always be traced to an exact source state.

**Secrets never travel with the release.**

They are injected by the platform at runtime, per environment. Rotation is independent of deployment.

**Deployment access is restricted and audited.**

```
Production deploy    release manager + on-call only
Migration execution  senior engineers only
Secret access        break-glass, audited, time-limited
Flag changes         audit logged with actor and reason
```

**Security releases are expedited but not exempt.**

A security fix uses the hotfix path — compressed timeline, identical verification. Disclosure follows deployment, never precedes it.

**Dependency gate.**

`pnpm audit` blocks on high and critical vulnerabilities. A release cannot ship with a known critical vulnerability in the dependency tree, per [security.md](./security.md).

---

# Performance Considerations

| Stage                           | Target   | Maximum |
| ------------------------------- | -------- | ------- |
| CI pipeline                     | < 8 min  | 15 min  |
| Release branch verification     | < 25 min | 45 min  |
| Staging deploy                  | < 5 min  | 10 min  |
| Production deploy (full canary) | < 35 min | 60 min  |
| Rollback                        | < 5 min  | 10 min  |
| Hotfix, end to end              | < 60 min | 90 min  |

Techniques

```
Remote build caching shared across CI and developers
Affected-only test execution on pull requests
Full suites only on release branches
Parallel test sharding
Immutable artifact promotion — build once, deploy three times
Pre-warmed staging so verification starts immediately
```

Deploy time matters most during a rollback. Every minute of rollback duration is a minute of customer impact, which is why the rollback path is a redeploy of an existing artifact rather than a rebuild.

---

# Workflows

## Standard release

```
Monday      develop stabilizes, release manager reviews the changelog
Tuesday 08  cut release/1.4.0, extended CI runs
Tuesday 09  release PR reviewed and merged to main
Tuesday 09  staging deploy, migrations applied
Tuesday 09  automated smoke; manual QA runs during the soak
Tuesday 13  soak complete, readiness review
Tuesday 14  production canary begins
Tuesday 15  100%, watch window
Tuesday 16  marked stable, changelog published
```

## Emergency rollback

```
10:14  Alert: payment failure rate 8% (baseline 1.2%)
10:15  On-call acknowledges, correlates with the 10:02 deploy
10:16  Rollback declared, no debate
10:19  Previous build live
10:22  Payment success rate recovered to baseline
10:25  Status page updated
10:40  Root cause identified in a staging reproduction
14:00  Fix merged, scheduled for the next release
Next day  Incident report published
```

Total customer impact: 20 minutes. Diagnosis happened after service was restored, not instead of it.

## Shipping a breaking schema change

```
Release N     schema 2.0.0 supported alongside 1.x
              migration written and tested against the full corpus
              renderer handles both versions
              new documents still written as 1.x
Release N+1   new documents written as 2.0.0
              existing documents migrate at load
Release N+2   1.x write path removed
              read support retained permanently
```

Read support is never removed. Published revisions written years earlier must continue to render.

---

# Best Practices

**Ship on Tuesday.**

Mid-week releases leave time to notice and fix. Friday releases are discovered on Monday, by customers.

**Release small.**

Ten changes are ten hypotheses. When something regresses, you want a short list of suspects.

**Never bypass a gate to make a date.**

The date was an estimate. The gate is the reason production works.

**Practice rollbacks.**

A rollback path first executed during an incident is an untested rollback path.

**Watch the deploy.**

Deploying and walking away is how a fifteen-minute incident becomes a three-hour one.

**Write the changelog for a user.**

They do not know what a reducer is and should not have to.

**Remove your flags.**

An unremoved flag is permanent complexity added by someone who has moved on.

**Keep staging honest.**

Every divergence between staging and production is a class of bug that can only be found in production.

---

# Success Criteria

The release process is successful when:

- Releases happen at least twice a week and nobody finds them stressful.
- Change failure rate stays below 5%.
- Mean time to recovery stays under 30 minutes.
- No release has ever caused irreversible data loss.
- No published checkout has ever rendered differently after a release without an intentional, communicated change.
- Every production deployment can be traced to an exact commit and rolled back within five minutes.
- Migrations are expand-only within a release, making rollbacks database-safe by construction.
- Customers learn about breaking changes from us, well in advance, never from a failure.
- The release manager rotation means anyone on the team can run a release.

---

# Philosophy

Shipping is the only part of software engineering that customers experience directly.

Everything else — the architecture, the tests, the reviews, the documentation — exists to make this moment safe. A release process is therefore not bureaucracy layered on top of engineering; it is the point at which all the earlier discipline either pays off or is revealed to have been theater.

The measure of a good release process is not that nothing ever goes wrong. Things will go wrong: a dependency will regress, an edge case will surface at scale, a migration will behave differently against real data. The measure is that when something goes wrong, it is caught in minutes rather than days, reversed in minutes rather than hours, and understood well enough that it does not happen twice.

Make releases boring.

Boring is what trustworthy looks like from the inside.
