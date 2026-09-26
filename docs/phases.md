# Checkout Studio Implementation Phases

**Version:** 1.0

**Status:** Execution Plan & Phase Gate Checklist

---

# Purpose

[roadmap.md](./roadmap.md) says _what_ we are building and _in what order_.

This document says _how to execute one phase_ — the exact scope, the packages touched, the tests required, and the criteria that must be met before the next phase begins.

It is a working checklist, not a narrative. It is meant to be open while building.

The governing rule from [roadmap.md](./roadmap.md) is absolute:

> Complete one phase at a time and stop for review before continuing.

A phase is not "mostly done". It is done, or it is in progress.

---

# How to Work a Phase

```
1. READ
   Open this document at the phase.
   Read every specification listed under Specs.
   Do not begin until the scope is unambiguous.

2. PLAN
   Confirm dependencies are complete.
   Restate the scope in your own words.
   Flag anything the specs do not answer — resolve before coding.

3. BUILD
   Follow Implementation Steps in order.
   Write tests alongside, never after.

4. TEST
   Satisfy every entry under Tests Required.
   Meet the coverage target.

5. VERIFY
   Run the phase verification commands.
   Walk the Exit Criteria checklist line by line.

6. DOCUMENT
   Update any /docs file whose described behavior changed.

7. COMMIT
   Conventional commits, per contributing.md.

8. STOP
   Report completion. Wait for approval.
   Do not begin the next phase.
```

---

# Phase Lifecycle

```
     ┌─────────────┐
     │ NOT STARTED │
     └──────┬──────┘
            │ dependencies met, scope confirmed
            ▼
     ┌─────────────┐
     │ IN PROGRESS │
     └──────┬──────┘
            │ implementation complete
            ▼
     ┌─────────────┐
     │  IN TEST    │ ◀──── fails ────┐
     └──────┬──────┘                 │
            │ all tests pass         │
            ▼                        │
     ┌─────────────┐                 │
     │  IN REVIEW  │ ─── rejected ───┘
     └──────┬──────┘
            │ approved
            ▼
     ┌─────────────┐
     │   COMPLETE  │
     └─────────────┘
```

A phase may only enter **In Test** when every Implementation Step is finished. Partial implementation with passing tests is the most common way a phase gets falsely marked complete.

---

# Testing Standard

Every phase carries the same testing obligation. This is the operational form of [testing.md](./testing.md).

## Coverage Targets

```
Statements   90%      Branches   85%
Functions    90%      Lines      90%

Critical modules: 100%
  packages/schema
  packages/renderer
  packages/plugin-sdk
  packages/editor/src/store         (state, history, clipboard, transactions, autosave)
  packages/api/src/services/stripe
  packages/api/src/services/billing
  packages/api/src/services/publishing
  packages/api/src/services/portability
```

This is the only critical-module list. Every phase's verification commands, and [contributing.md](./contributing.md), refer to it. Everything else is held to the 90% floor — including the rest of `packages/editor` (canvas, drag and drop, inspector, palette).

Coverage is a floor, not a goal. 90% coverage of trivial paths with no edge-case tests fails review.

## What Must Be Unit Tested — Always

```
Every pure function
Every hook
Every store action and selector
Every parser, serializer, validator, formatter
Every reducer and state transition
Every algorithm (traversal, collision, cascade, resolution)
Every error path
Every boundary condition (empty, single, maximum, malformed)
```

## Test Naming

```ts
describe("moveNode", () => {
  it("moves a node to a new parent at the given index", …)
  it("rejects a move that would create a cycle", …)
  it("preserves child order in the source parent", …)
  it("returns the original schema when the move is a no-op", …)
})
```

The test name states the behavior. A reader who never sees the assertion should understand what is guaranteed.

## The Four Tests Every Unit Needs

```
1. Happy path        the documented behavior
2. Boundary          empty, one, many, maximum
3. Invalid input     malformed, wrong type, out of range
4. Error path        what happens when it fails
```

A unit with only a happy-path test is untested.

## Test Placement

```
Unit + component     colocated:  Button.tsx  ·  Button.test.tsx
Integration          packages/<pkg>/tests/integration/
E2E                  apps/studio/e2e/  ·  apps/renderer/e2e/
Fixtures             packages/schema/fixtures/   shared across packages
```

Shared fixtures matter. When the editor, renderer, and importer each keep their own idea of a valid schema, they will eventually disagree.

## Per-Phase Verification

Every phase ends with the same commands:

```bash
pnpm lint
pnpm typecheck
pnpm test --coverage
pnpm test:e2e          # phases that add a user-facing flow
pnpm build
```

All five must pass. No exceptions, no "known failure", no skipped suites.

---

# Universal Exit Criteria

These apply to **every** phase, in addition to its specific criteria.

```
✓ All Implementation Steps complete
✓ pnpm lint            zero warnings
✓ pnpm typecheck       zero errors, strict mode, no `any`, no suppressions
✓ pnpm test            passing, coverage target met
✓ pnpm build           all apps and packages
✓ Layer boundaries respected (no violations reported)
✓ No TODOs, no dead code, no commented-out blocks
✓ No console.log
✓ Accessibility verified where UI was added
✓ Responsive verified at 1440 / 768 / 390 where UI was added
  (published checkouts also at 1280 and 320, per testing.md)
✓ Dark mode verified where UI was added
✓ Performance budgets respected
✓ Errors handled per error-handling.md
✓ Telemetry added per observability.md
✓ /docs updated where behavior changed
✓ Committed with conventional commits
✓ Reported and awaiting approval
```

---

# Progress Tracker

| Phase | Name                            | Status       | Depends on |
| ----- | ------------------------------- | ------------ | ---------- |
| 0     | Product & Architecture Planning | **Complete** | —          |
| 1     | Repository Foundation           | **Complete** | 0          |
| 2     | Infrastructure                  | **Complete** | 1          |
| 3     | Design System                   | **Complete** | 1          |
| 4     | Studio Shell                    | Not Started  | 2, 3       |
| 5     | Editor State Engine             | Not Started  | 2          |
| 6     | Renderer Engine                 | Not Started  | 2, 5       |
| 7     | Visual Canvas                   | Not Started  | 4, 6       |
| 8     | Drag & Drop Engine              | Not Started  | 7          |
| 9     | Core Component Library          | Not Started  | 8          |
| 10    | Form System                     | Not Started  | 9          |
| 11    | Checkout Components             | Not Started  | 10         |
| 12    | Property Inspector              | Not Started  | 11         |
| 13    | Stripe Integration              | Not Started  | 11         |
| 14    | Asset Management                | Not Started  | 8, 12      |
| 15    | Templates                       | Not Started  | 13, 14     |
| 16    | Publishing                      | Not Started  | 6, 13, 14  |
| 17    | AI Assistant                    | Not Started  | 12         |
| 18    | Analytics                       | Not Started  | 16         |
| 19    | Performance Optimization        | Not Started  | 18         |
| 20    | Testing                         | Not Started  | 19         |
| 21    | Production Release              | Not Started  | 20         |
| 22    | Enterprise Features             | Not Started  | 21         |
| 23    | Marketplace                     | Not Started  | 21         |
| 24    | Collaboration                   | Not Started  | 21         |
| 25    | Version 1.0 Launch              | Not Started  | 21, 22     |

Update the Status column as phases progress. This table is the single source of truth for where the project stands.

---

# Phase 0 — Product & Architecture Planning

**Status:** Complete

**Depends on:** —

**Specs:** all of `/docs`

### Goal

A complete engineering blueprint with no major architectural decision left undefined.

### Delivered

32 specifications plus [README.md](./README.md). See Phase 0 in [roadmap.md](./roadmap.md) for the full index.

### Exit Criteria

```
✓ Every specification written and internally consistent
✓ All internal links resolve
✓ No conflicting architecture between documents
✓ Terminology, package names, and folder names consistent
✓ A senior engineer can implement from the docs alone
```

---

# Phase 1 — Repository Foundation

**Depends on:** Phase 0

**Specs:** [monorepo-structure.md](./monorepo-structure.md) · [coding-standards.md](./coding-standards.md) · [contributing.md](./contributing.md)

### Goal

A clean monorepo where the architecture is enforced by tooling rather than by discipline.

### In Scope

```
Turborepo + pnpm workspace
apps/studio and apps/renderer scaffolds (Next.js App Router)
All 13 packages scaffolded with correct dependencies
TypeScript strict, project references
ESLint (incl. layer boundaries) · Prettier · Husky · commitlint
Vitest + React Testing Library configured
Playwright configured
CI pipeline
Environment variable validation
```

### Out of Scope

```
Any feature code
Any database work
Any UI — each app renders only its root layout and health route
```

### Packages Created

```
packages/config  types  utils  observability  schema
         design-system  ui  hooks  database  api
         plugin-sdk  editor  renderer
apps/studio  apps/renderer
plugins/* registered as a workspace glob (plugin packages are created in the phase that builds them)
```

### Implementation Steps

```
1.  Initialize pnpm workspace and Turborepo
2.  Create packages/config with eslint, typescript, tailwind, prettier, vitest presets
3.  Scaffold all 13 packages with package.json, tsconfig.json, src/index.ts, README
4.  Wire tsconfig project references to match the layer model
5.  Author the ESLint boundaries rule set
6.  Add dependency-cruiser configuration
7.  Scaffold apps/studio and apps/renderer with Next.js App Router
8.  Install Tailwind in each app with the shared base config (the design-system preset is authored and wired in Phase 3)
9.  Add Husky hooks: pre-commit, commit-msg, pre-push
10. Configure Vitest with coverage thresholds
11. Configure Playwright
12. Author the environment validation schema (Zod) and .env.example
13. Author turbo.json with complete task inputs and outputs
14. Author CI workflows
15. Author scripts/create-package.ts and scripts/create-plugin.ts
```

### Tests Required

**Unit**

```
packages/config      preset shape validation
packages/utils       every scaffolded utility, if any
env validation       valid config · missing var · malformed var
                     · sk_live_ rejected outside production
```

**Integration**

```
Boundary enforcement: a deliberate violating import fails lint
Cycle detection:      a deliberate cycle fails dependency-cruiser
Package generation:   create-package produces a package that builds
```

**Build**

```
pnpm build succeeds cold
pnpm build succeeds warm from cache
Turbo cache hit rate verified on a no-op change
```

**Coverage:** 90% (there is little code; the target is trivially met and still enforced)

### Verification

```bash
pnpm install && pnpm check
pnpm build --force          # cold
pnpm build                  # warm, expect cache hits
node scripts/verify-boundaries.mjs
```

### Exit Criteria

```
✓ All universal criteria
✓ pnpm dev starts both apps
✓ A violating import fails lint with the documented message
✓ A circular dependency fails CI
✓ Warm build completes in under 30 seconds
✓ CI pipeline completes in under 8 minutes
✓ Commit with a bad message is rejected by commitlint
✓ Missing environment variable fails startup with a precise message
```

---

# Phase 2 — Infrastructure

**Depends on:** Phase 1

**Specs:** [database.md](./database.md) · [security.md](./security.md) · [error-handling.md](./error-handling.md) · [observability.md](./observability.md) · [api-spec.md](./api-spec.md)

### Goal

Every cross-cutting service the rest of the product depends on: persistence, identity, cache, storage, errors, and telemetry.

### In Scope

```
Prisma schema for all entities in database.md
PostgreSQL migrations + seed
Repository layer with mandatory tenant scoping
Clerk authentication and route protection
Redis (Upstash) client and cache helpers
Upload boundary: permitted types, size limits, project scoping
  (the storage provider SDK is installed in Phase 14, where it is used)
AppError model, catalog, and normalizers
AuditLog entity and append-only write path (the viewer is Phase 22)
Plan catalog, entitlement resolver, and assertCan — every account resolves to
  the Free plan until Phase 25 connects Stripe Billing; staff accounts receive
  explicit overrides. Metering for each limit lands with the feature it limits.
Structured logger, metrics, tracing, correlation context
API middleware: auth · rateLimit · validate · telemetry · errors
Health check endpoints
```

### Out of Scope

```
Any editor or renderer code
Any Stripe code (Phase 13)
Stripe Billing (Phase 25) — the entitlement engine is in scope here
```

### Packages Touched

```
packages/database  api  utils  observability  types
apps/studio (middleware, health routes)
```

### Implementation Steps

```
1.  Author prisma/schema.prisma for every entity in database.md
2.  Generate the client; create the pooled singleton
3.  Write the initial migration; verify against a seeded dataset
4.  Author the seed script
5.  Build the repository layer — every method takes TenantContext
6.  Add `import "server-only"` to database and server API entry points
7.  Integrate Clerk; protect dashboard routes
8.  Build the Redis client and typed cache helpers
9.  Implement the upload boundary (types, limits, project scoping)
10. Implement AppError, createError, and the full catalog
11. Implement normalizers: fromZod, fromPrisma, fromFetch
12. Implement retry with backoff and jitter, plus idempotency storage
13. Implement the AuditLog write path, with append-only database permissions
14. Implement logger, metrics registry (typed labels), tracer, context propagation
15. Implement API middleware chain and withErrorHandling
16. Implement /api/health/live, /api/health, /api/health/deep
17. Implement the plan catalog, entitlement resolver (cached, invalidated on change), and assertCan
```

### Tests Required

**Unit**

```
Repositories        create · read · update · soft delete · relations
                    · ownership enforced · cross-tenant access denied
AppError            construction · every catalog entry has both messages
Normalizers         Zod · Prisma · fetch · unknown → correct AppError
Retry               backoff · jitter · cap · non-retryable rejected
                    · max attempts honored
Idempotency         duplicate key returns stored result, does not re-execute
Logger              record shape · redaction of every sensitive field
Metrics             forbidden label rejected at compile time
Correlation         id propagates through async context
Cache               get · set · delete · TTL · miss path
                    · Redis unavailable falls through
Middleware          auth · authz · validation · rate limit · error mapping
```

**Integration**

```
Transactions        rollback on failure, no partial writes
Migrations          apply cleanly, then apply again (idempotent)
Seed                produces a valid, queryable dataset
Auth                unauthenticated request → 401
                    wrong-tenant request → 404, not 403 (no existence oracle)
Health              healthy · degraded · unhealthy status codes
Error envelope      every failure returns the documented shape
```

**Security**

```
No response contains a stack trace, SQL, or internal path
No log record contains a password, token, key, or PII
Rate limit returns 429 with retry-after
```

**Coverage:** 90% overall · 100% on repositories and the error model

### Verification

```bash
pnpm db:migrate && pnpm db:seed
pnpm check
curl localhost:3000/api/health | jq
```

### Exit Criteria

```
✓ All universal criteria
✓ Every repository method rejects cross-tenant access, proven by test
✓ Every API failure returns the documented envelope with a correlation id
✓ Redaction test passes against the full sensitive-field fixture
✓ A client component importing packages/database fails the build
✓ Health endpoints return correct status in all three states
✓ Correlation id flows from request through log, trace, and response
```

---

# Phase 3 — Design System

**Depends on:** Phase 1

**Specs:** [design-system.md](./design-system.md) · [theme-system.md](./theme-system.md) · [ui-guidelines.md](./ui-guidelines.md)

### Goal

Every visual primitive the product needs, built entirely on tokens, fully accessible, in light and dark.

### In Scope

```
Token tiers: primitives → semantics → component tokens
Light, dark, and high-contrast themes
CSS variable generation, applied pre-paint
Tailwind preset bound to semantic tokens
Motion tokens with reduced-motion collapse
packages/ui component library:
  primitives   Button Input Textarea Select Checkbox Radio Switch
               Dialog Popover Tooltip DropdownMenu ContextMenu Tabs
               Accordion Slider ColorPicker
  composites   DataTable EmptyState CommandPalette FileUpload SearchInput
  feedback     Toast Alert Skeleton Spinner ErrorState
  layout       Panel ResizablePanel Splitter ScrollArea
  errors       AppErrorBoundary RouteErrorBoundary PanelErrorBoundary ErrorFallback
The Studio application wired to the design-system stylesheets
  (the renderer is themed by the checkout theme, Phase 6)
```

### Out of Scope

```
Checkout theme resolution (Phase 6, in the renderer)
Editor-specific components (Phase 4)
```

### Packages Touched

```
packages/design-system  ui
```

### Implementation Steps

```
1.  Author primitive tokens: color scales, spacing, radius, shadow, motion
2.  Author semantic tokens; bind each to a primitive
3.  Author component tokens; bind each to a semantic
4.  Author light, dark, and high-contrast token sets
5.  Generate variables.css; add the pre-paint theme script
6.  Author the Tailwind preset consuming semantic tokens only
7.  Build primitives, one at a time, each fully tested before the next
8.  Build composites
9.  Build feedback components
10. Build layout components
11. Build the Studio error boundaries on top of the Phase 2 error model
12. Wire the Studio application to the design-system stylesheets. The renderer
    application is deliberately excluded: its CSS ships with every published
    checkout, which is themed by the checkout theme in Phase 6, and the
    architecture keeps builder weight out of it
13. Verify contrast on every semantic pairing
14. Add visual regression baselines
```

### Tests Required

**Unit — every component**

```
Renders with default props
Every variant renders
Every size renders
Disabled state
Loading state
Controlled and uncontrolled behavior
Event handlers fire with correct arguments
Ref forwarding
className merging
```

**Accessibility — every component**

```
Correct role
Accessible name
Keyboard operable (Enter, Space, Arrows, Escape, Tab as applicable)
Focus visible
Focus trapped and restored (Dialog, Popover, DropdownMenu)
axe reports zero violations
Screen reader announcement where state changes
```

**Tokens**

```
Every semantic token resolves to a defined primitive
Every component token resolves to a defined semantic
No token resolves more than three levels
Mode switch rebinds semantics only
No component source contains a literal color or px value
Reduced motion collapses every duration token to 0
Contrast: every semantic pairing meets WCAG AA
```

**Visual regression**

```
Every component × every variant × light and dark
```

**Coverage:** 90%

### Verification

```bash
pnpm test --filter=@checkout-studio/ui --coverage
pnpm test:visual
node scripts/check-hardcoded-values.mjs
```

### Exit Criteria

```
✓ All universal criteria
✓ Zero hardcoded colors, sizes, radii, or shadows in any component
✓ Zero axe violations across the library
✓ Every component keyboard-operable
✓ Every semantic pairing passes AA contrast
✓ Dark mode requires no conditional logic in any component
✓ No flash of incorrect theme on load
✓ Visual regression baselines committed
```

---

# Phase 4 — Studio Shell

**Depends on:** Phase 2, Phase 3

**Specs:** [ui-guidelines.md](./ui-guidelines.md) · [editor-behavior.md](./editor-behavior.md) · [keyboard-shortcuts.md](./keyboard-shortcuts.md)

### Goal

The editor frame — every panel, resizable and persistent — with no editing capability yet.

### In Scope

```
Three-panel layout with a top toolbar and bottom status bar
Resizable, collapsible, persistent panels
Left sidebar tab shell: Components · Layers · Pages · Assets · Templates · Theme
Right inspector shell with accordion sections
Empty canvas area
Command registry and command palette (⌘K)
Keyboard registry, scopes, and dispatcher
Dashboard: project create, rename, delete (soft), and list; project detail; settings
Settings → Keyboard: remap, disable character-key shortcuts, reset (WCAG 2.1.4)
Loading skeletons and empty states throughout
```

### Out of Scope

```
Canvas rendering (Phase 7)
Actual editing (Phase 5+)
Panel contents beyond structure
```

### Packages Touched

```
apps/studio  packages/ui  packages/editor (keyboard, commands)
```

### Implementation Steps

```
1.  Build the shell layout: toolbar 64px, status bar 32px, three columns
2.  Implement resizable panels with min/max constraints from ui-guidelines
3.  Persist panel widths and collapsed state per user
4.  Build the left sidebar tab shell
5.  Build the right inspector accordion shell
6.  Implement the command registry (id, title, category, availability, run)
7.  Implement the keyboard registry: normalization, scopes, dispatcher, guards
8.  Implement startup conflict detection and the reserved-key table
9.  Build the command palette with filters (> # @ :)
10. Build the shortcut reference overlay (⌘/)
11. Build dashboard routes and empty states
12. Render toolbar items from registered commands only — an item appears when its
    command is registered and available, so unbuilt features are absent rather than stubbed
```

### Tests Required

**Unit**

```
Panel resize          min · max · persistence · collapse · restore
Command registry      register · unregister · availability · duplicate rejected
Keyboard normalize    ⌘ vs Ctrl per platform · physical key codes
Scope resolution      specificity ordering · overlay exclusivity
Text input guard      ⌫ in a field never dispatches a node command
Reserved keys         every reserved key passes through to the browser
Conflict detection    duplicate binding in one scope fails at startup
Chord buffer          timeout · cancel · unmatched continuation
Palette               search ranking · filters · keyboard navigation
```

**Integration**

```
Panel state survives reload
⌘K opens, Escape closes, focus restored to the prior element
Every registered command appears in the palette
Shortcut labels rendered in menus match the registry
```

**E2E**

```
Load the editor · resize panels · reload · layout preserved
Open the palette · run a command · verify effect
```

**Accessibility**

```
Tab order: toolbar → left → canvas → inspector → status bar
Panels are landmark regions with accessible names
Palette is a proper combobox with correct ARIA
Escape always exits the current context
```

**Coverage:** 90% · 100% on the keyboard registry

### Verification

```bash
pnpm test --filter=@checkout-studio/editor --coverage
pnpm test:e2e --filter=studio -g "shell"
```

### Exit Criteria

```
✓ All universal criteria
✓ Every command is reachable from the palette
✓ No browser or OS shortcut is shadowed outside a documented exception
✓ A conflicting shortcut registration fails at startup, loudly
✓ Panel layout persists across sessions
✓ Full keyboard navigation of the shell, no mouse required
✓ Editor shell loads in under 2 seconds
```

---

# Phase 5 — Editor State Engine

**Depends on:** Phase 2 — autosave persists through the API, and session locks live in Redis

**Specs:** [state-management.md](./state-management.md) · [schema.md](./schema.md) · [history-versioning.md](./history-versioning.md) · [api-spec.md](./api-spec.md)

### Goal

The brain of the editor: a normalized, immutable, serializable store with complete undo, redo, and clipboard support.

This is the most heavily tested phase in the project.

### In Scope

```
packages/schema:  types · validation · migration registry · pure tree operations
packages/editor:  Zustand store with Immer
  slices: nodes · selection · viewport · history · clipboard · theme
          · assets · publishing · dragState
  selectors, transactions, autosave queue
Session lock and optimistic version checking
```

### Out of Scope

```
Canvas rendering (Phase 7)
Drag interaction (Phase 8)
Any UI
```

### Packages Touched

```
packages/schema  editor  types
```

### Implementation Steps

```
1.  Author canonical schema types in packages/schema, inferred from its Zod schemas
2.  Implement structural validation (Zod)
3.  Implement referential validation: orphans, cycles, duplicate ids, missing root
4.  Implement the migration registry and the migrate() entry point
5.  Implement pure tree operations: insert move remove duplicate wrap unwrap traverse
6.  Implement normalize() — canonical form for hashing and diffing
7.  Implement serialize / deserialize
8.  Build the Zustand store with Immer
9.  Implement each slice, with selectors
10. Implement the history system: patches, grouping, 50-state cap
11. Implement transactions — multi-step mutations producing one history entry
12. Implement the clipboard: copy, cut, paste, paste-in-place, paste-styles
13. Implement autosave: 5s debounce, 30s maximum wait, dirty tracking, durable offline queue
14. Implement session locks and baseVersion conflict detection
15. Implement corruption detection and history-walk recovery
16. Implement page create, rename, duplicate, delete (soft), and list — API and store
17. Build the Pages panel in the left sidebar
```

### Tests Required

This phase requires **100% coverage**. Every listed case is mandatory.

**Tree operations — pure functions**

```
insert       into empty parent · at index 0 · at end · beyond end (clamped)
             · into a node that rejects children
move         to new parent · reorder among siblings · to same position (no-op)
             · into own descendant (rejected — cycle)
             · preserves source sibling order
remove       leaf · subtree · root (rejected) · non-existent (no-op)
             · orphans no nodes
duplicate    single node · deep subtree · regenerates every id
             · rewrites every internal reference · no id collisions over 10k runs
wrap         single · multiple siblings · non-contiguous selection
unwrap       promotes children to the parent, preserving order
traverse     depth-first order · early exit · empty tree · single node
Purity       every operation returns a new object; input is never mutated
```

**Validation**

```
Valid schema accepted
Missing root rejected
Orphaned node rejected
Circular parent chain rejected
Duplicate id rejected
Child referencing a non-existent parent rejected
Unknown component type reported, not fatal
Every error names the offending node ids
```

**Migration**

```
Every registered version pair migrates
Chained migration across three versions
Migration is pure — the input document is unchanged
Unknown source version rejected with a precise message
Newer-than-supported version rejected, never partially applied
```

**History**

```
Undo restores exact prior state
Redo restores exact undone state
Redo cleared by a new action
50-state cap discards oldest
Grouped actions count as one entry
10 rapid nudges → 1 undo step
Undo after: add · delete · move · duplicate · style · theme · responsive
Undo restores selection
Undo after a failed operation is a no-op
```

**Selection**

```
Single · multi · toggle · clear
Select parent · first child · next/previous sibling
Selection of a deleted node is cleared
Multi-select operations: move · delete · duplicate · group · lock · hide
```

**Clipboard**

```
Copy → paste produces new ids
Paste in place preserves position
Paste styles applies styles only, content unchanged
Cut removes from source
Cross-project paste validates before insertion
Pasted foreign JSON is rejected unless it passes full schema validation
  (the complete import pipeline, with redaction and asset rehydration, is added to paste in Phase 15)
```

**Autosave**

```
Fires after 5s of inactivity
Fires at most 30s apart during continuous editing
Does not fire when nothing changed
Does not fire on selection, zoom, or panel changes
Failure queues and retries with backoff
Queue survives reload (IndexedDB)
Replay is ordered and idempotent
```

**Concurrency**

```
Lock acquired on open
Second session receives the takeover-required state (the prompt UI is Phase 7)
Takeover flushes the losing session before transfer
Stale write rejected with 409 and a diff summary
Every conflict path preserves both versions
```

**Serialization**

```
State → JSON → state round-trips exactly
No functions, no class instances, no DOM references in output
Normalized form is key-order independent
```

**Performance**

```
2,000-node tree: single node update under 16ms
2,000-node tree: undo under 50ms
Updating one node does not invalidate unrelated selectors
```

**Coverage:** 100%

### Verification

```bash
pnpm test --filter=@checkout-studio/schema --coverage    # must be 100%
pnpm test --filter=@checkout-studio/editor --coverage    # must be 100%
pnpm bench --filter=@checkout-studio/editor
```

### Exit Criteria

```
✓ All universal criteria
✓ 100% coverage on schema and editor state
✓ No tree operation mutates its input, proven by test
✓ No sequence of operations can produce an invalid tree
✓ Undo/redo verified across every mutation type
✓ 2,000-node benchmark meets every target
✓ Corrupted state recovers from history without data loss
```

---

# Phase 6 — Renderer Engine

**Depends on:** Phase 2, Phase 5

**Specs:** [renderer.md](./renderer.md) · [schema.md](./schema.md) · [plugin-api.md](./plugin-api.md) · [theme-system.md](./theme-system.md)

### Goal

A standalone rendering engine that turns a schema into a page, with zero knowledge of the editor.

This phase and Phase 5 are the two that must be perfect.

### In Scope

```
packages/plugin-sdk:  manifest · lifecycle · all registries · permissions
packages/renderer:    runtime · component resolution · recursive rendering
                      · theme compilation to CSS variables
                      · six-stage style resolution
                      · responsive cascade
                      · visibility rule evaluation
                      · context providers
                      · error boundaries and fallbacks
                      · SSR, static, embed, and editor-preview modes
apps/renderer:        published page route ([domain]/[slug])
```

### Out of Scope

```
Actual components (Phase 9) — this phase tests against fixture components
   registered from the test suite, never shipped in production code
Forms (Phase 10)
Checkout components (Phase 11)
Tokenized draft preview links and the embed script (Phase 16)
```

### Packages Touched

```
packages/plugin-sdk  renderer  apps/renderer
```

### Implementation Steps

```
1.  Implement the plugin manifest type and lifecycle
2.  Implement the component registry, renderer registry, and validator registry
3.  Implement the permission model
4.  Implement CheckoutRenderer: validate → migrate → providers → render
5.  Implement recursive node rendering with no depth limit
6.  Implement component resolution with core.unsupported fallback
7.  Implement theme compilation to scoped CSS variables (--ck-, .checkout-root)
8.  Implement the six-stage style resolution cascade
9.  Implement the responsive cascade (desktop → tablet → mobile)
10. Implement token reference resolution ({colors.primary})
11. Implement visibility rule evaluation, executed before render
12. Build the Theme and Variable providers, and the Plugin Provider slot through which
    plugins contribute domain providers (checkout, forms) in Phases 10–11
13. Build node and plugin error boundaries with mode-specific fallbacks
14. Implement SSR, static, embed, and editor-preview modes
15. Build the apps/renderer published route: [domain]/[slug]
16. Implement font subsetting and preloading
```

### Tests Required

This phase requires **100% coverage**.

**Rendering**

```
Single node · nested tree · deeply nested (100 levels)
Empty tree · single-node tree
Children render in stored order
Unknown component type → core.unsupported, no crash
Component throws → boundary catches, page still renders
Renderer never mutates the input schema (deep-freeze test)
Same input always produces identical output
```

**Style resolution**

```
Each of the six stages applied in order
Later stage overrides earlier
Theme default used when no node style
Component default used when no theme value
State overrides (hover, focus, active, disabled)
Unresolvable token falls back to component default and warns
Circular token reference rejected at validation
```

**Responsive**

```
Desktop base inherited by tablet and mobile
Tablet override affects tablet and mobile, not desktop
Mobile override affects mobile only
Editor-preview mode computes only the active breakpoint
Published and static modes emit every breakpoint as media-query CSS
SSR output is identical regardless of viewport; zero hydration mismatches across widths
Breakpoint-only visibility is expressed as CSS display rules, never by omitting nodes
Missing breakpoint falls back correctly
```

**Theme**

```
Compiles to CSS variables once, memoized on themeId:version
Variables scoped to .checkout-root, never :root
Dark override layer applied sparsely
Theme change repaints without re-rendering the tree
Font subset includes only referenced weights
```

**Visibility**

```
Always visible · always hidden · conditional true · conditional false
Hidden nodes are skipped entirely, children included
Rules evaluated before render, never during
```

**Modes**

```
SSR produces valid HTML
Static produces self-contained output
Hydration produces zero mismatches
Embed scopes all styles and does not leak
Editor-preview shows visible fallbacks; production shows none
```

**Migration**

```
Every supported schema version renders
Chained migration renders identically to a natively-authored document
Unsupported version falls back to the last good revision
```

**Security**

```
Schema content is never evaluated as code
No eval, no Function in packages/renderer
No inline script in renderer output other than framework scripts carrying the CSP nonce
HTML block content sanitized
SVG assets stripped of script and handlers
CSS values rejected: url(javascript:), expression(), @import
```

**Performance**

```
2,000 nodes render under 100ms
5,000 nodes render without failure
Style resolution memoized; cache key correctness verified
Only interactive components hydrate
```

**Coverage:** 100%

### Verification

```bash
pnpm test --filter=@checkout-studio/renderer --coverage   # must be 100%
pnpm test --filter=@checkout-studio/plugin-sdk --coverage
pnpm test:e2e --filter=renderer
node scripts/check-renderer-deps.mjs
```

### Exit Criteria

```
✓ All universal criteria
✓ 100% coverage on renderer and plugin-sdk
✓ Zero imports of editor, ui, or design-system in packages/renderer
✓ apps/renderer published route: first-party JavaScript under 150 KB gzipped
  (first-party = everything served from our origin, including the React and Next.js runtime;
   third-party = other origins, such as Stripe.js)
✓ Renderer is pure — same input, same output, input never mutated
✓ A broken component never breaks a page
✓ Zero hydration mismatches
✓ 2,000-node render under 100ms
```

---

# Phase 7 — Visual Canvas

**Depends on:** Phase 4, Phase 6

**Specs:** [editor-behavior.md](./editor-behavior.md) · [ui-guidelines.md](./ui-guidelines.md) · [performance.md](./performance.md) · [renderer.md](./renderer.md)

### Goal

An infinite canvas that renders the node tree and responds to every interaction within one frame.

### In Scope

```
Infinite canvas with pan and zoom (10%–400%)
Device frames: desktop 1440 · tablet 768 · mobile 390
Selection overlays, resize handles, hover outlines
Alignment guides, 8px grid, snapping
Rulers
Breadcrumb navigation
Inline selection toolbar
Layers panel (virtualized) with keyboard reorder, lock, hide, rename, search
  (drag reorder arrives with drag and drop in Phase 8)
Session takeover prompt and read-only mode UI (the state was built in Phase 5)
Auto-scroll near canvas edges
Empty-container placeholders
```

### Out of Scope

```
Drag and drop insertion (Phase 8)
Property editing (Phase 12)
```

### Packages Touched

```
packages/editor (canvas, layers)  apps/studio  packages/ui
Consumes packages/renderer (editor-preview mode) — the renderer never imports the editor
```

### Implementation Steps

```
1.  Build the viewport: pan, zoom, transform math, zoom-to-cursor
2.  Implement zoom-to-fit and zoom-to-selection
3.  Build device frame switching, preserving zoom
4.  Render the node tree through the renderer's editor-preview mode — the canvas and the
    published page share one rendering path, so what the user edits is what ships
5.  Build the selection overlay layer, rendered independently of content
6.  Implement resize handles with live update and snapping
7.  Implement hover outlines with component labels and dimensions
8.  Implement alignment guides: edges, centers, equal spacing
9.  Implement the grid and snap toggles
10. Build rulers
11. Build breadcrumb navigation
12. Build the inline selection toolbar
13. Build the virtualized Layers panel
14. Implement auto-scroll with smooth acceleration
```

### Tests Required

**Unit**

```
Viewport         pan · zoom in/out · zoom to cursor · clamping at 10% and 400%
                 · zoom to fit · zoom to selection · reset
Coordinates      screen ↔ canvas transform, round-trips at every zoom level
Selection        hit testing · nested nodes · deepest-node selection
                 · box selection intersection math
Snapping         edge · center · equal spacing · threshold · disabled
Guides           computed only for visible siblings · cleared on release
Layers           virtualization windowing · expand/collapse · search filter
                 · reorder produces the correct move operation
Breadcrumb       path computation from any node to root
Auto-scroll      triggers near edge · acceleration curve · stops at bounds
```

**Integration**

```
Canvas output matches published-mode output for the same schema (WYSIWYG parity)
Selecting on canvas highlights the layer, and vice versa
Breadcrumb click selects the correct ancestor
Device switch preserves zoom and selection
Overlay position stays correct through pan and zoom
Resize updates the store and creates one history entry
```

**E2E**

```
Deferred to Phase 9, which provides the first real components.
Until then there is nothing real to select, so these flows are covered by
integration tests that register fixture components inside the test suite.
```

**Performance**

```
Benchmarks run in a harness that registers fixture components from the test suite:
2,000 nodes: pan sustains 60 FPS
2,000 nodes: zoom sustains 60 FPS
Selection change under 16ms
Moving one node does not re-render the canvas
Layers panel with 2,000 nodes renders under 100ms
```

**Coverage:** 90%

### Verification

```bash
pnpm test --filter=@checkout-studio/editor --coverage
pnpm test:e2e --filter=studio -g "canvas"
pnpm bench:canvas
```

### Exit Criteria

```
✓ All universal criteria
✓ 60 FPS sustained during pan and zoom on a 2,000-node project
✓ Selection feedback within 16ms
✓ Overlays render independently of node content
✓ Layers panel virtualized, verified with 2,000 nodes
✓ Full canvas navigation by keyboard
✓ Zoom and pan state survive a device switch
```

---

# Phase 8 — Drag & Drop Engine

**Depends on:** Phase 7

**Specs:** [editor-behavior.md](./editor-behavior.md) · [ui-guidelines.md](./ui-guidelines.md) · [keyboard-shortcuts.md](./keyboard-shortcuts.md)

### Goal

Drag and drop that never leaves the user guessing where something will land — and that works entirely by keyboard.

### In Scope

```
dnd-kit integration
Component Library panel: searchable, categorized list of every registered component,
  built from the registry (so plugins appear automatically)
Drag from the component library to the canvas
Drag reorder in the Layers panel
Reorder within a parent
Move across containers, at any nesting depth
Collision detection and drop-target resolution
Insertion indicators and container highlighting
Drag preview (80% opacity, shadow, 1.02 scale)
Auto-scroll during drag
Keyboard dragging with announced drop positions
Invalid-drop rejection with a stated reason
```

### Out of Scope

```
Dragging assets (Phase 14)
Dragging templates (Phase 15)
```

### Packages Touched

```
packages/editor/src/dnd  apps/studio
```

### Implementation Steps

```
1.  Integrate dnd-kit sensors: pointer, keyboard, touch
2.  Implement collision detection tuned for nested containers
3.  Implement drop-target resolution: inside vs. between
4.  Implement the insertion indicator
5.  Implement container highlight and auto-expand on hover
6.  Build the drag preview
7.  Wire drop to the store's move/insert transaction
8.  Implement auto-scroll during drag
9.  Implement the keyboard sensor with live-region announcements
10. Implement validity rules and rejection messaging
```

### Tests Required

**Unit**

```
Collision         topmost target at a point · nested containers
                  · empty container · zero-height container
Drop resolution   inside a container · between siblings
                  · before first · after last
Validity          node into itself (rejected)
                  · node into own descendant (rejected)
                  · into a locked parent (rejected)
                  · into a node that accepts no children (rejected)
                  · each rejection returns a stated reason
Indicator         position math at every zoom level
Auto-scroll       direction · acceleration · bounds
```

**Integration**

```
Drag from library → canvas creates a node at the indicated position
Reorder produces the correct sibling order
Cross-container move reparents correctly
Drop produces exactly one history entry
Undo after drop fully restores the prior tree
Cancelled drag (Escape) leaves the tree unchanged
```

**E2E**

```
Deferred to Phase 9, which provides the first real components.
Covered here by integration tests using fixture components registered in the test suite.
```

**Accessibility**

```
Keyboard drag reachable and completable
Every drop position announced via a live region
Escape cancels and restores the original position
```

**Performance**

```
Drag sustains 60 FPS on a 2,000-node project
No layout thrashing during drag (transform only)
```

**Coverage:** 90% · 100% on collision and validity logic

### Verification

```bash
pnpm test --filter=@checkout-studio/editor -t "dnd" --coverage
pnpm test:e2e --filter=studio -g "drag"
```

### Exit Criteria

```
✓ All universal criteria
✓ Drop position is always shown before release
✓ No drag can produce an invalid tree
✓ Every rejection explains itself
✓ Complete keyboard drag-and-drop, announced to screen readers
✓ 60 FPS sustained during drag
✓ One drag equals one undo step
```

---

# Phase 9 — Core Component Library

**Depends on:** Phase 8

**Specs:** [component-library.md](./component-library.md) · [plugin-api.md](./plugin-api.md) · [theme-system.md](./theme-system.md)

### Goal

The layout and content components users actually build with, delivered as plugins to prove the plugin architecture works.

### In Scope

```
plugins/core-layout    Section Container Grid Stack Columns Spacer Divider
plugins/core-content   Heading Text Badge Image Video Icon Button Link
plugins/core-embed     HTML Block · Code Block · Embed · Lottie
The property definition schema in plugin-sdk, which every properties.ts validates against
The canonical component catalog in component-library.md is the source of type ids
Each component ships the standard triple:
  definition.ts   registration metadata, defaults, validation
  Renderer.tsx    renderer-side component
  properties.ts   declarative property definitions — data, not UI
Split package exports: ./renderer and ./editor

The inspector UI is generated from properties.ts in Phase 12.
No component ever ships a hand-built inspector panel, per architecture.md.
```

### Out of Scope

```
Form components (Phase 10)
Checkout components (Phase 11)
The inspector UI that renders property definitions (Phase 12)
```

### Packages Touched

```
plugins/core-layout  plugins/core-content
```

### Implementation Steps

```
1.  Establish the component authoring pattern with Section as the reference
2.  Implement layout components
3.  Implement content components
4.  Author defaults, validation rules, property definitions, and category metadata for each
5.  Split exports so the renderer never receives editor-only code (property definitions, previews, icons)
6.  Register both plugins with the editor and the renderer
7.  Verify the renderer bundle did not grow beyond budget
```

### Tests Required

**Unit — every component**

```
Renders with defaults
Every documented editable property has an effect
Responsive styles apply per breakpoint
Accepts children where documented; rejects them where not
Validation rules fire (Heading empty · Image missing src · Button missing target)
Renders correctly with zero children
Renders correctly with many children (100+)
Semantic HTML element is correct (h1–h6, section, img, button, a)
```

**Accessibility — every component**

```
Correct role and semantics
Image requires alt; decorative images use alt=""
Button has a type attribute
Link has an accessible name
Heading level order is validated and warned on skip
Contrast validated against the active theme
Keyboard operable where interactive
axe reports zero violations
```

**Integration**

```
Registered in the component registry on plugin load
Resolvable by the renderer
Insertable in the editor
Disposing the plugin unregisters every component
Renderer bundle excludes editor-only code, proven by bundle analysis
Every property definition validates against the property definition schema
```

**E2E — including the flows deferred from Phases 7 and 8**

```
Pan, zoom, select, resize, switch device, undo — by mouse, then by keyboard only
Drag a Section, then a Heading inside it, then reorder
Move a node from one container to another
Keyboard drag mode: pick up, move across containers, drop, undo
2,000 real nodes: pan, zoom, and drag sustain 60 FPS in the running app
```

**Visual regression**

```
Every component × 3 breakpoints × light and dark
```

**Coverage:** 90%

### Verification

```bash
pnpm test --filter="./plugins/*" --coverage
pnpm test:visual -g "components"
pnpm build && node scripts/check-bundle.mjs
```

### Exit Criteria

```
✓ All universal criteria
✓ Every component follows the definition / Renderer / properties triple
✓ Zero axe violations across all components
✓ Every component supports all three breakpoints
✓ Renderer bundle contains no editor-only code
✓ Renderer bundle still under 150 KB
✓ Disposing a plugin cleanly unregisters everything it added
```

---

# Phase 10 — Form System

**Depends on:** Phase 9

**Specs:** [component-library.md](./component-library.md) · [renderer.md](./renderer.md) · [security.md](./security.md)

### Goal

Form components that validate correctly, submit reliably, and are usable by everyone.

### In Scope

```
plugins/core-forms:
  Input (text · email · phone · number · password)
  Textarea · Select · Checkbox · Radio Group · Address · Country
React Hook Form context created by the renderer
Zod schema generated dynamically from the node tree
Conditional field logic
Submission handling and the Submission entity
```

### Out of Scope

```
Payment fields (Phase 11 and 13 — Stripe owns those)
```

### Packages Touched

```
plugins/core-forms  packages/api
```

### Implementation Steps

```
1.  Implement the form provider in plugins/core-forms, contributed through the Plugin Provider slot
2.  Implement dynamic Zod schema generation from node validation rules
3.  Implement each form component, wired to the shared form context
4.  Implement conditional visibility driven by field values
5.  Implement submission: validate → POST → persist → confirm
6.  Implement the Submission repository and endpoint
7.  Implement error display, focus management, and announcements
```

### Tests Required

**Unit — every component**

```
Renders · label association · placeholder is not the label
Value changes propagate to form state
Required validation
Type validation (email, phone, number ranges)
Custom validation rules
Error message rendering and aria-describedby wiring
Disabled and readonly states
Default values
Reset behavior
```

**Schema generation**

```
Node validation rules → correct Zod schema
Optional vs required
Nested and conditional fields
Unknown rule ignored safely, warned
```

**Conditional logic**

```
Field shown when the condition is met
Field hidden when not
Hidden field values excluded from submission
Chained conditions
Circular condition rejected
```

**Submission**

```
Valid submission persists and confirms
Invalid submission blocks and focuses the first error
Server rejection surfaces inline
Network failure retries safely
Duplicate submission produces one record (idempotency)
Payload validated server-side, never trusted
```

**Accessibility**

```
Every input has an associated label
Errors announced via a live region
Focus moves to the first error on failed submit
Fieldsets and legends for radio groups
Required state exposed via aria-required
Complete keyboard navigation and submission
```

**Security**

```
Submitted payloads validated with Zod server-side
No field content logged
Rate limiting on the submission endpoint
XSS payload in a field is escaped on display
```

**Coverage:** 90% · 100% on schema generation and validation

### Verification

```bash
pnpm test --filter=@checkout-studio/plugin-core-forms --coverage
pnpm test:e2e --filter=renderer -g "form"
```

### Exit Criteria

```
✓ All universal criteria
✓ Every field is labelled and keyboard operable
✓ Validation errors are announced to screen readers
✓ Server never trusts client validation
✓ Conditional logic cannot produce an unreachable required field
✓ Duplicate submission produces exactly one record
```

---

# Phase 11 — Checkout Components

**Depends on:** Phase 10

**Specs:** [component-library.md](./component-library.md) · [stripe-integration.md](./stripe-integration.md) · [theme-system.md](./theme-system.md)

### Goal

The components that make this a checkout builder rather than a page builder.

### In Scope

```
plugins/checkout:
  Product Card · Product List · Order Summary · Coupon
  Shipping Selector · Tax Summary · Order Bump · Trust Badges · Guarantee Box
plugins/marketing:
  Countdown · Testimonial · FAQ · Logo Wall · Reviews · Progress Bar
Checkout context provider: cart · customer · discounts · shipping · tax · currency
CheckoutDataSource interface — the seam through which the provider obtains quotes,
  applies coupons, and selects shipping

The provider depends on the CheckoutDataSource interface, not on an implementation.
This phase tests against an in-memory data source defined in the test suite.
The production data source — the server pricing engine — is delivered in Phase 13.
Nothing here is user-reachable before then: publishing does not exist until Phase 16.
```

### Out of Scope

```
Payment Element and Express Checkout (Phase 13 — they cannot exist without Stripe)
The production CheckoutDataSource and pricing engine (Phase 13)
Page-level payment validation (Phase 13)
Automatic tax calculation (future — see stripe-integration.md)
```

### Packages Touched

```
plugins/checkout  plugins/marketing
```

### Implementation Steps

```
1.  Define the CheckoutDataSource interface in plugins/checkout — checkout concepts never enter the engine
2.  Implement the Checkout context provider against that interface
3.  Implement Product Card and Product List
4.  Implement Order Summary reading exclusively from checkout context
5.  Implement Coupon: input, pending, applied, and rejected states; applying
    dispatches through the data source — validation is always server-side
6.  Implement Order Bump and its effect on the cart
7.  Implement Shipping Selector and Tax Summary as display components
8.  Implement trust and guarantee components
9.  Implement marketing components
10. Add validation: a page containing checkout components requires a product
```

### Tests Required

**Unit — every component**

```
Renders with context data
Renders with empty or missing context (graceful)
Currency formatting: USD · EUR · JPY (zero-decimal) · BHD (three-decimal)
Amounts displayed from context, never computed locally
Every editable property has an effect
Responsive behavior
```

**Order Summary specifically**

```
Subtotal · discount · shipping · tax · total displayed correctly
Zero-value lines hidden when configured
Line ordering is stable
Never performs arithmetic — displays server values only
Updates when checkout context changes
```

**Order Bump**

```
Toggling updates the cart in context
Toggling triggers a re-quote
Removing restores the prior total
```

**Countdown**

```
Counts down correctly across timezones
Expired state renders
Does not drift over long durations
Cleans up its timer on unmount
```

**Validation**

```
Page with checkout components but no product errors
Order Summary with no product warns
Duplicate coupon fields on one page warn
```

**Data source seam**

```
Provider works against any CheckoutDataSource implementation
Data source failure surfaces an error state, never a wrong total
Slow data source shows pending states, never stale totals as final
Coupon rejection from the data source renders the rejected state
```

**Accessibility**

```
Order Summary readable as a table or definition list
Order Bump is a real, labelled checkbox
Countdown announces politely, never assertively
FAQ accordion is keyboard operable with correct ARIA
```

**Coverage:** 90%

### Verification

```bash
pnpm test --filter=@checkout-studio/plugin-checkout --coverage
pnpm test --filter=@checkout-studio/plugin-marketing --coverage
pnpm test:visual -g "checkout"
```

### Exit Criteria

```
✓ All universal criteria
✓ No component computes a monetary amount
✓ Every currency class formats correctly
✓ The provider has no knowledge of any concrete data source
✓ Page-level validation catches every documented invalid configuration
✓ Zero axe violations
```

---

# Phase 12 — Property Inspector

**Depends on:** Phase 11 — the inspector must cover every component from Phases 9–11

**Specs:** [ui-guidelines.md](./ui-guidelines.md) · [theme-system.md](./theme-system.md) · [plugin-api.md](./plugin-api.md)

### Goal

An inspector that builds itself from component registrations — with no hardcoded panel anywhere.

### In Scope

```
Dynamic panel construction from registered property definitions
Accordion sections, per ui-guidelines.md:
  General · Layout · Spacing · Typography · Background · Border
  · Effects (incl. shadows) · Animation · Responsive · Accessibility · Advanced
Property controls: number · slider · color · select · toggle · spacing box
                   · font picker · shadow editor · gradient editor
Token picker with detached-value indicator
Per-property reset to default
Responsive override editing and indicators
Property search
Multi-selection editing with mixed-value display
```

### Out of Scope

```
AI suggestions (Phase 17)
```

### Packages Touched

```
packages/editor/src/inspector  packages/ui  plugins/* (property definitions)
```

### Implementation Steps

```
1.  Build the Theme panel (brand, colors, typography, spacing, radius, shadows,
    component slots, dark mode) with live preview and contrast validation
2.  Implement dynamic section and control construction
3.  Build every property control
4.  Implement the token picker and detach/reattach behavior
5.  Implement per-property reset
6.  Implement responsive override editing with per-breakpoint indicators
7.  Implement "apply to all breakpoints" (⌘↵)
8.  Implement property search
9.  Implement multi-selection with mixed-value states
10. Verify every component from Phases 9–11 renders a complete inspector from its properties.ts
```

### Tests Required

**Unit — every control**

```
Renders current value
Change fires with the correct typed value
Keyboard increment: ↑↓ ±1 · ⇧ ±10 · ⌥ ±0.1
Invalid input rejected, prior value retained
Reset restores the default
Disabled state
Mixed value state (multi-selection)
```

**Panel construction**

```
Sections built from registrations, no hardcoding
Unknown property type falls back safely
Component with no properties renders an empty state
Section order is deterministic
Search filters across sections
```

**Responsive**

```
Editing at desktop writes the base
Editing at tablet writes an override
Override indicator shown on overridden properties only
Reset removes the override, restoring inheritance
Apply-to-all writes every breakpoint in one history entry
```

**Tokens**

```
Token picker lists valid tokens for the property type
Selecting a token stores a reference, not a literal
Literal entry marks the property detached
Reattach restores the token reference
```

**Integration**

```
Property change updates the store and the canvas within 16ms
Property change creates exactly one history entry
Rapid changes (slider drag) group into one entry
Multi-selection change applies to every selected node
```

**Accessibility**

```
Every control is labelled
Tab order follows visual order
Accordion sections expose expanded state
Color picker is keyboard operable
```

**Coverage:** 90%

### Verification

```bash
pnpm test --filter=@checkout-studio/editor -t "inspector" --coverage
pnpm test:e2e --filter=studio -g "inspector"
```

### Exit Criteria

```
✓ All universal criteria
✓ Zero hardcoded property panels anywhere in the codebase
✓ A new component's inspector appears with no editor changes
✓ Property change reflected on canvas within 16ms
✓ Slider drag produces one undo step
✓ Responsive overrides visually distinguishable
✓ Every control keyboard operable
```

---

# Phase 13 — Stripe Integration

**Depends on:** Phase 11

**Specs:** [stripe-integration.md](./stripe-integration.md) · [security.md](./security.md) · [error-handling.md](./error-handling.md) · [database.md](./database.md)

### Goal

Real money, correctly. This is the highest-risk phase in the project.

### In Scope

```
Connect Standard OAuth with CSRF-protected state
Connection storage, capability sync, health checks
Server-authoritative pricing engine: quotes, signing, coupons, shipping, tax
Production CheckoutDataSource backed by the pricing engine (the Phase 11 seam)
Payment Intent creation and update on connected accounts
Payment Element and Express Checkout components (plugins/checkout)
Page-level payment validation: exactly one Payment Element, a product, currency set
Payment method domain registration for Apple Pay and Google Pay
Webhook endpoint: verify → dedupe → persist → acknowledge → process
Idempotent order creation with a database uniqueness constraint
Refunds and dispute handling
Hourly reconciliation job
```

### Out of Scope

```
Subscriptions and recurring payments (future)
Stripe Tax (future)
Our own billing (Phase 25)
```

### Packages Touched

```
packages/api/src/services/stripe  packages/database
apps/renderer (checkout API, webhook route)  plugins/checkout
```

### Implementation Steps

```
1.  Implement OAuth: authorize URL, signed state in Redis, callback verification
2.  Implement connection storage and account.updated sync
3.  Implement currency handling (minor units, zero/three-decimal)
4.  Implement the pricing engine: line items, coupons, shipping, tax, totals
5.  Implement quote signing and expiry
6.  Implement the production CheckoutDataSource over the quote API
7.  Implement Payment Intent creation with recomputation and idempotency
8.  Implement Payment Intent update for mid-session cart changes
9.  Build the Payment Element and Express Checkout components with
    theme-derived Appearance and the explicit unavailable state
10. Implement deferred Stripe.js loading
11. Register payment method domains per connected account (Apple Pay, Google Pay)
12. Add page-level payment validation
13. Implement the webhook endpoint with the full verification pipeline
14. Implement durable event persistence and async dispatch
15. Implement idempotent order creation inside one transaction
16. Add the UNIQUE constraint on stripePaymentIntentId
17. Implement refunds
18. Implement dispute handling and evidence assembly
19. Implement the hourly reconciliation job
20. Implement payment metrics and alerts
21. Add the Stripe dependency to /api/health (the check deployment.md specifies)
```

### Tests Required

**100% coverage. Every case below is mandatory.**

**Connect**

```
OAuth happy path
State mismatch rejected, logged as a security event
Expired state rejected
Authorization denied by the merchant
Disconnect marks the connection revoked, retains orders
chargesEnabled false marks the project not payment-ready
Capability change via webhook updates status
Payment method domain registered on connect, per connected account
```

**Pricing**

```
Single product · multiple products · quantities
Order bump added and removed
Coupon: valid · expired · usage-limit reached · minimum not met
        · not applicable to the products
Shipping method selection
Tax applied per configuration
Currency: USD · JPY (zero-decimal) · BHD (three-decimal)
Rounding applied once, at the end
Client-supplied price ignored
Client-supplied price differing from schema logged as tampering
Quote signature valid · tampered · expired
Recomputation at intent creation catches a price change
Recomputation catches a coupon expiring mid-session
```

**Payment Intents**

```
Created with the server-computed amount
Created on the connected account (Stripe-Account header present)
Metadata carries pageId, revisionId, quoteId
Idempotency key prevents a duplicate intent
Update on cart change; refused once confirmed
Only client_secret returned to the browser
```

**Webhooks**

```
Valid signature accepted
Invalid signature rejected with 400 and a security log
Timestamp older than 5 minutes rejected
Duplicate event.id is a no-op returning 200
Unknown connected account returns 200 and is ignored
Event persisted before processing
Acknowledged before processing
Out-of-order delivery handled
Processing failure retries independently of Stripe
```

**Orders**

```
Created only after retrieving the intent from Stripe
Amount verified against the expected total
Amount mismatch → PAYMENT_AMOUNT_MISMATCH, critical, no order
Currency mismatch rejected
Idempotent: same intent twice creates one order
Concurrent duplicate webhooks: unique constraint wins, one order
Transaction rolls back completely on any failure
Coupon marked redeemed only on success
Post-commit side effects fire once
```

**Payment Element & Express Checkout**

```
Renders inside reserved dimensions — no layout shift on mount
Appearance derived from the checkout theme
Stripe.js not requested before first form focus or LCP + 3s
Every failure mode shows the explicit unavailable state — never a silent fallback
Keyboard operable; errors announced
```

**Page validation**

```
No Payment Element → error
Two Payment Elements → error
No product → error
Currency not configured → error
```

**Payment outcomes**

```
Success · each decline code mapped to user copy
3D Secure required, then completed
3D Secure abandoned
Payment canceled
Customer closes the tab — order still created by webhook
Network failure mid-confirm — retry confirms the same intent
Double-click on Pay — one charge
```

**Refunds**

```
Full · partial · accumulated partials
Over-refund rejected server-side
Refund webhook updates order status
Unauthorized role rejected
```

**Reconciliation**

```
Orphan charge detected and alerted
Phantom order detected
Amount mismatch detected
Refund not reflected auto-corrected
```

**Failure**

```
Database down at order creation → durable retry + page + customer sees success
Stripe outage → Payment Element unavailable state, no false success
Redis down → quoting still works
Merchant disconnects mid-session → STRIPE_NOT_CONNECTED
```

**Security**

```
No card data in any log, request, or response
No merchant secret key stored anywhere
client_secret never logged
Signature verification cannot be disabled in any environment
Rate limits on quote and intent endpoints
Card-testing pattern raises a security alert
```

**Coverage:** 100%

### Verification

```bash
pnpm test --filter=@checkout-studio/api -t "stripe" --coverage   # must be 100%
stripe listen --forward-to localhost:3001/api/webhooks/stripe
pnpm test:e2e --filter=renderer -g "checkout"
node scripts/verify-no-card-data.mjs
```

### Exit Criteria

```
✓ All universal criteria
✓ 100% coverage on the Stripe service
✓ No merchant secret key exists anywhere in the system
✓ No card data appears in any log, request, response, or database column
✓ Every amount charged was computed by the server
✓ No order is created from a browser assertion
✓ Duplicate submission produces exactly one charge and one order
✓ Reconciliation detects a deliberately orphaned charge
✓ Stripe.js is deferred and excluded from the first-party bundle
✓ Full E2E checkout passes in Stripe test mode, including 3DS and decline
  (run against a published revision seeded directly into the test database —
   the Phase 6 published route serves it; the publishing UI arrives in Phase 16)
```

---

# Phase 14 — Asset Management

**Depends on:** Phase 8 (drag to canvas), Phase 12 (asset picker in the inspector)

**Specs:** [database.md](./database.md) · [security.md](./security.md) · [performance.md](./performance.md)

### Goal

Upload, optimize, organize, and serve media without ever serving an original upload.

### In Scope

```
Upload manager with progress and cancellation
Media library: grid, search, filter, sort, folders
Automatic optimization: resize, compress, WebP, AVIF, thumbnails
Asset picker integrated into the inspector
Drag assets onto the canvas
Soft delete with usage checking
Storage metering, enforced through assertCan (Phase 2)
```

### Out of Scope

```
Video transcoding (future)
AI image generation (future)
```

### Packages Touched

```
packages/api/src/services/assets  packages/database
apps/studio (asset panel)  packages/ui
```

### Implementation Steps

```
1.  Install the storage provider SDK and implement the upload endpoint against
    the Phase 2 boundary (type and size validation)
2.  Implement image optimization: 4 sizes, WebP and AVIF variants
3.  Implement EXIF stripping and re-encoding
4.  Implement SVG sanitization
5.  Implement content hashing and deduplication
6.  Build the Asset repository with tenant scoping
7.  Build the media library UI (virtualized)
8.  Implement search, filter, sort, and folders
9.  Build the asset picker for the inspector
10. Implement drag-to-canvas
11. Implement soft delete with a usage check
12. Implement quota enforcement
```

### Tests Required

**Unit**

```
Type validation: allowed types accepted, executables rejected
Size limit enforced
Content hash computed correctly and stably
Duplicate content stored once, referenced twice
Image optimization produces every configured size and format
EXIF and geolocation stripped
Malformed image rejected
SVG script tags, event handlers, and external refs stripped
Font magic bytes validated
Quota calculation and enforcement
```

**Integration**

```
Upload → optimize → available in library
Delete blocked when the asset is in use; explains where
Soft delete retains the record
Cross-tenant asset access denied
Search, filter, and sort return correct results
Library virtualized with 1,000 assets
```

**E2E**

```
Upload an image, insert it into a page, then render it through a published revision
  seeded directly into the test database (the publishing UI is Phase 16)
Drag an asset from the library onto the canvas
```

**Security**

```
Executable upload rejected
SVG with an embedded script sanitized
Path traversal in filename rejected
Original upload is never served
```

**Performance**

```
Library with 1,000 assets renders under 200ms
Upload does not block the editor
Optimization runs asynchronously
```

**Coverage:** 90% · 100% on sanitization

### Verification

```bash
pnpm test --filter=@checkout-studio/api -t "assets" --coverage
pnpm test:e2e --filter=studio -g "assets"
```

### Exit Criteria

```
✓ All universal criteria
✓ No original upload is ever served
✓ Every SVG is sanitized; the malicious fixture is neutralized
✓ Identical content is stored once
✓ Deleting an in-use asset is blocked with an explanation
✓ Library virtualized, verified with 1,000 assets
```

---

# Phase 15 — Templates

**Depends on:** Phase 13 (checkout templates need a Payment Element), Phase 14

**Specs:** [template-system.md](./template-system.md) · [export-import.md](./export-import.md) · [theme-system.md](./theme-system.md)

### Goal

Templates, symbols, and the bundle format that carries them — the portability layer.

### In Scope

```
Template library: categories, search, tags, favorites, recent
Template install with ID regeneration and asset rehydration
Symbols with instance sync and detach
Export: JSON and ZIP bundles with manifest and checksums
Import: analyze → plan → conflicts → commit → report
Archive hardening
Template validation before publish
```

### Out of Scope

```
Marketplace distribution (Phase 23)
AI template generation (Phase 17)
```

### Packages Touched

```
packages/api/src/services/portability  packages/schema
apps/studio (template panel)  packages/database
```

### Implementation Steps

```
1.  Implement bundle serialization: manifest, checksums, JSON and ZIP
2.  Implement the redaction pipeline as an explicit stage
3.  Implement normalization for stable hashing
4.  Implement archive extraction hardening
5.  Implement the integrity and compatibility gates
6.  Implement the import analyzer producing an ImportPlan
7.  Implement ID regeneration and reference rewriting
8.  Implement asset rehydration with hash deduplication
9.  Implement conflict detection and resolution strategies
10. Implement the transactional commit and ImportReport
11. Implement symbols: storage, instance sync, detach
12. Build the template library UI
13. Implement template validation
14. Author the initial template set
```

### Tests Required

**Round trip**

```
Export → import → export produces byte-identical normalized output
Normalization is key-order independent
```

**Export**

```
Page · project · section · theme · symbol scopes
JSON and ZIP formats
Manifest contents accurate
Checksums correct
Redaction: no secret, credential, tenant id, or PII in any bundle
```

**Import**

```
Analyze writes nothing
Plan lists every action, conflict, and warning
ID regeneration: 10,000 imports produce zero collisions
Every reference rewritten; zero orphans
Assets deduplicated by hash
Missing plugin → core.unsupported, data preserved, recovers when the plugin is registered again
Paste of foreign JSON now runs the full import pipeline: validation, redaction, ID regeneration, asset rehydration
Schema migration applied on import
Commit is atomic; failure at every stage rolls back completely
Duplicate slug, symbol name, and asset name conflicts
Every theme strategy: keep-target · apply-bundle · merge-additive · namespace
```

**Archive security**

```
Zip bomb rejected (ratio, size, entry count)
Absolute path rejected
../ traversal rejected
Symlink rejected
Entry count limit enforced
Corrupt checksum rejected
Bundle from a newer version rejected, never partially applied
```

**Symbols**

```
Editing a symbol updates every instance
Detach makes an instance independent
Deleting a symbol with instances is blocked or converts them
Symbol inside a symbol rejected
```

**Coverage:** 100% on export, import, and sanitization

### Verification

```bash
pnpm test --filter=@checkout-studio/api -t "portability" --coverage
pnpm test --filter=@checkout-studio/schema -t "normalize"
pnpm test:e2e --filter=studio -g "template"
```

### Exit Criteria

```
✓ All universal criteria
✓ Round-trip byte equality proven
✓ No bundle has ever contained a secret, proven against the full fixture
✓ Every hostile archive fixture is rejected
✓ A failed import leaves zero trace
✓ Missing plugins degrade and fully recover
✓ Template install completes in under 500ms
```

---

# Phase 16 — Publishing

**Depends on:** Phase 6, Phase 13, Phase 14

**Specs:** [history-versioning.md](./history-versioning.md) · [deployment.md](./deployment.md) · [database.md](./database.md) · [stripe-integration.md](./stripe-integration.md)

### Goal

Draft to live, immutably and reversibly.

### In Scope

```
Tokenized draft preview links (apps/renderer preview/[token] route)
Stripe readiness gate: a page with a Payment Element cannot publish unless chargesEnabled
Disconnecting Stripe unpublishes pages containing a Payment Element
Publish: validate → snapshot theme → create immutable revision → point page → invalidate cache
Version history panel with named snapshots
Rollback and restore
Custom domains with SSL
Embed script and route
Unpublish
```

### Out of Scope

```
Multi-region deployment (future)
```

### Packages Touched

```
packages/api/src/services/publishing  packages/database
apps/studio  apps/renderer
```

### Implementation Steps

```
1.  Implement pre-publish validation with actionable messages
2.  Implement theme snapshotting into the revision
3.  Implement immutable revision creation
4.  Implement the publish transaction and cache invalidation
5.  Implement preview tokens with expiry
6.  Build the version history panel
7.  Implement named manual snapshots
8.  Implement rollback (clone to a new draft, never overwrite)
9.  Implement custom domain verification and SSL provisioning
10. Implement the embed script and the apps/renderer embed/[id] route
11. Implement unpublish
```

### Tests Required

**Unit**

```
Validation catches: no payment element · two payment elements
                    · no product · Stripe not connected · chargesEnabled false
                    · unresolved asset · invalid schema
Disconnecting Stripe unpublishes every page containing a Payment Element
                    and retains every order
Revision creation is immutable; a published revision cannot be modified
Theme snapshot captured at publish time
Publish is idempotent on the same revision hash
Preview token: valid · expired · tampered · wrong page
Rollback clones, never overwrites
Restore creates a new draft
```

**Integration**

```
Publish → public URL serves the published revision
Edit after publish → published version unchanged
Republish → new revision, new content served
Rollback → previous content served, original revision intact
Unpublish → 404 or configured redirect
Cache invalidated on publish
Custom domain serves the correct page
Embed script inserts an iframe on a third-party page; the host page's styles and scripts cannot reach the checkout
```

**E2E**

```
Build → preview → publish → visit → edit → republish → rollback
```

**Security**

```
Preview token required; guessing rejected
Published page exposes no draft content
Embed does not leak or inherit host page styles
```

**Performance**

```
Publish completes in under 5 seconds
Published page LCP under 2.5s
Lighthouse ≥ 95 on a published checkout
```

**Coverage:** 100% on the publishing service

### Verification

```bash
pnpm test --filter=@checkout-studio/api -t "publishing" --coverage
pnpm test:e2e -g "publish"
pnpm lighthouse
```

### Exit Criteria

```
✓ All universal criteria
✓ A published revision has never been modified after creation
✓ Editing after publish never affects the live page
✓ Rollback restores exactly, leaving the original intact
✓ Theme is snapshotted; later theme edits do not alter published pages
✓ Lighthouse ≥ 95 on a published checkout
✓ Embed is fully style-isolated
```

---

# Phase 17 — AI Assistant

**Depends on:** Phase 12

**Specs:** [ai-assistant.md](./ai-assistant.md) · [schema.md](./schema.md) · [security.md](./security.md)

### Goal

An assistant that produces validated editor actions — never React, never direct mutation, always undoable.

### In Scope

```
AI service with provider abstraction
Prompt builder with scoped context
Structured action output and the action validator
Action executor routed through normal editor commands
Modes: chat · generate · edit · optimize · copywriting · accessibility
Streaming responses
Rate limiting and cost controls
```

### Out of Scope

```
Image generation · voice · multi-agent workflows (future)
```

### Packages Touched

```
packages/api/src/services/ai  packages/editor  apps/studio
```

### Implementation Steps

```
1.  Build the provider abstraction (no vendor SDK outside it)
2.  Implement the prompt builder with strict context scoping
3.  Define the structured action schema
4.  Implement the action validator: permissions · schema · component types · responsive rules
5.  Implement the executor, routing every action through existing commands
6.  Implement streaming
7.  Build the AI panel UI
8.  Implement confirmation rules for destructive actions
9.  Implement rate limiting and token budgets
10. Implement AI telemetry (metadata only)
```

### Tests Required

**Unit**

```
Prompt builder      includes required context · excludes unnecessary data
                    · never includes secrets or PII
                    · respects context size limits
Action validator    valid action accepted
                    · unknown action type rejected
                    · unknown component type rejected
                    · action on a non-existent node rejected
                    · action violating permissions rejected
                    · malformed JSON rejected
                    · action producing an invalid tree rejected
Executor            each action type produces the correct mutation
                    · every AI operation creates exactly one history entry
                    · undo fully reverts an AI change
                    · destructive actions require confirmation
Provider            switching providers requires no editor change
                    · provider failure degrades the panel only
```

**Integration**

```
Prompt → actions → validated → executed → canvas updated → undoable
Invalid model output rejected with a clear message, editor unaffected
Rate limit returns a friendly message
Streaming renders progressively and can be cancelled
```

**Security**

```
Prompt injection cannot produce an unvalidated action
AI output is never evaluated as code
No prompt content logged without explicit opt-in
No secret ever reaches a provider
Rate limits enforced per user and per token budget
```

**Coverage:** 90% · 100% on the action validator

### Verification

```bash
pnpm test --filter=@checkout-studio/api -t "ai" --coverage
pnpm test:e2e --filter=studio -g "ai"
```

### Exit Criteria

```
✓ All universal criteria
✓ AI never mutates state except through validated editor commands
✓ Every AI change is a single undoable history entry
✓ No AI action can produce an invalid schema
✓ No AI output is ever executed as code
✓ Provider swap requires no change outside the abstraction
✓ First response under 3 seconds
```

---

# Phase 18 — Analytics

**Depends on:** Phase 16

**Specs:** [observability.md](./observability.md) · [database.md](./database.md) · [security.md](./security.md)

### Goal

Merchants can see what their checkouts are actually doing.

### In Scope

```
Event collection on published checkouts
Checkout funnel: viewed → started → payment attempted → succeeded → completed
Abandonment attribution by stage
Dashboard: revenue · orders · conversion · visitors · AOV
Per-page and per-template performance
Date range filtering and comparison
Bot filtering
Consent handling
```

### Out of Scope

```
A/B testing (future)
Cross-session customer journeys (future)
```

### Packages Touched

```
packages/api/src/services/analytics  packages/observability
packages/database  apps/studio  apps/renderer
```

### Implementation Steps

```
1.  Implement the event collection endpoint (batched, non-blocking)
2.  Implement bot filtering and deduplication
3.  Implement funnel stage attribution
4.  Implement aggregation jobs and materialized rollups
5.  Build the dashboard UI with charts
6.  Implement date range filtering and period comparison
7.  Implement retention per plan
8.  Implement consent gating
```

### Tests Required

**Unit**

```
Event validation: valid accepted · malformed rejected · oversized rejected
Bot filtering: known agents · headless heuristics · own-session exclusion
Deduplication within a session
Funnel stage assignment for every path, including abandonment at each stage
Conversion, AOV, and revenue math, including zero-denominator cases
Date range boundaries and timezone handling
Retention pruning respects the plan limit resolved by the entitlement resolver (Phase 2)
```

**Integration**

```
Checkout view recorded once per load
Completed purchase advances every funnel stage
Abandonment attributed to the correct stage
Dashboard totals match raw event counts
Cross-tenant analytics access denied
```

**Security**

```
No PII in analytics records
Consent opt-out stops collection entirely
IP truncated, user agent parsed and discarded
```

**Performance**

```
Event collection adds under 5ms to a page view
Never blocks rendering
Dashboard loads under 500ms with 1M events
```

**Coverage:** 90%

### Verification

```bash
pnpm test --filter=@checkout-studio/api -t "analytics" --coverage
pnpm test:e2e -g "analytics"
```

### Exit Criteria

```
✓ All universal criteria
✓ Analytics never blocks or slows a published checkout
✓ No PII in any analytics record
✓ Opting out stops collection completely
✓ Dashboard numbers reconcile against raw events
✓ Bots excluded, verified against a known-agent fixture
```

---

# Phase 19 — Performance Optimization

**Depends on:** Phase 18 — optimization runs against the complete feature set

**Specs:** [performance.md](./performance.md) · [monorepo-structure.md](./monorepo-structure.md)

### Goal

Meet every budget in [performance.md](./performance.md), with benchmarks that prevent regression.

### In Scope

```
Virtualization: layers · component library · asset library · templates · history
Memoization audit driven by profiling
Bundle analysis and code splitting
Dynamic imports for heavy modules
Image and font optimization verification
Render optimization: selector granularity, overlay isolation
Database query optimization: indexes, N+1 elimination
Cache strategy implementation
Benchmark suite wired into CI
```

### Out of Scope

```
New features of any kind
```

### Packages Touched

```
All — this is a cross-cutting phase
```

### Implementation Steps

```
1.  Establish the benchmark suite and record baselines for every metric
2.  Profile the editor with a 2,000-node project; fix the top bottlenecks
3.  Virtualize every long list
4.  Audit memoization — add only where profiling shows benefit, remove where not
5.  Analyze bundles; split by route, feature, dialog, and plugin
6.  Convert heavy modules to dynamic imports
7.  Verify image pipeline output and font subsetting
8.  Audit selector granularity; eliminate over-subscription
9.  Add database indexes; eliminate N+1 queries
10. Implement the Redis cache strategy
11. Wire benchmarks and bundle budgets into CI as gates
```

### Tests Required

**Benchmarks — every one recorded and enforced**

```
Editor load                       < 2s
Selection                         < 16ms
Property change                   < 16ms
Drag                              60 FPS
Canvas pan and zoom               60 FPS
Undo / redo                       < 50ms
Autosave                          < 500ms
Publish                           < 5s
Render 2,000 nodes                < 100ms
Theme swap on 2,000 nodes         < 50ms
Template install                  < 500ms
API p50                           < 200ms
Memory after 1 hour of editing    < 300MB
```

**Bundle**

```
apps/renderer first-party         < 150 KB gzipped
apps/studio initial               < 250 KB gzipped
No editor code in the renderer bundle
No editor-only plugin code in the renderer bundle
Stripe.js deferred, excluded from first-party measurement
```

**Web Vitals — on a published checkout**

```
LCP < 2.5s · INP < 200ms · CLS < 0.1 · FCP < 1.8s
Lighthouse: Performance ≥95 · Accessibility 100 · Best Practices 100 · SEO ≥95
```

**Memory**

```
1-hour editing session: no upward heap drift
Observers, listeners, timers, and object URLs disposed on unmount
Undo history bounded at 50 states
```

**Stress**

```
100 pages · 5,000 components · large images · deep nesting
Editor remains responsive throughout
```

**Regression**

```
Every benchmark runs in CI and fails the build on regression beyond threshold
```

**Coverage:** maintain existing targets; no coverage loss permitted

### Verification

```bash
pnpm bench --record
pnpm build && pnpm analyze
pnpm lighthouse
pnpm test:memory
```

### Exit Criteria

```
✓ All universal criteria
✓ Every metric in performance.md met and recorded
✓ Benchmarks enforced in CI
✓ Bundle budgets enforced in CI
✓ Lighthouse targets met on a real published checkout
✓ No memory growth over a 1-hour session
✓ Every optimization documented with before and after numbers
```

---

# Phase 20 — Testing

**Depends on:** Phase 19

**Specs:** [testing.md](./testing.md) · [error-handling.md](./error-handling.md) · [security.md](./security.md)

### Goal

Close every gap. This phase does not add features; it makes the previous nineteen trustworthy.

### In Scope

```
Coverage gap analysis and closure to target
Complete E2E suite for every critical flow
Visual regression across components, pages, and templates
Accessibility audit across every surface
Security testing
Chaos and failure injection
Browser matrix testing
Load testing
Test documentation
```

### Out of Scope

```
New features
```

### Implementation Steps

```
1.  Run coverage analysis; enumerate every gap
2.  Close gaps, prioritizing critical modules to 100%
3.  Complete the E2E suite for all critical flows
4.  Build the visual regression baseline across all breakpoints and themes
5.  Full accessibility audit: automated plus manual screen reader passes
6.  Security testing: authz, escalation, XSS, CSRF, injection, rate limits
7.  Chaos testing: kill Redis, database, Stripe; inject latency; corrupt schemas
8.  Browser matrix: Chrome, Edge, Firefox, Safari
9.  Load testing on published checkouts
10. Document the testing approach and how to run each suite
```

### Tests Required

**E2E — every critical flow**

```
Register → verify → sign in → dashboard
Create project → create page → add components → save → reload → persists
Connect Stripe → add payment element → publish
Customer: visit → fill → pay → success → order created
Decline → retry → success
3D Secure challenge → complete
Edit → save → revision → restore
Draft → publish → edit → republish → rollback
Install template → customize → publish
Upload asset → insert → publish → renders
Export project → import into a new project → identical
Keyboard-only: build a complete page and publish it
Two sessions → conflict → every resolution path
```

**Accessibility**

```
Every page: axe zero violations
Every flow completable by keyboard alone
Screen reader pass: VoiceOver and NVDA
Focus order and visibility verified on every surface
200% zoom usable
prefers-reduced-motion respected
Color contrast verified across all themes
```

**Security**

```
Broken access control across every endpoint
Privilege escalation attempts
Cross-tenant access attempts
XSS in every user-content field
CSRF on every mutation
SQL injection attempts
Rate limit enforcement
Session fixation and expiry
Webhook signature forgery
Import archive attacks
```

**Chaos**

```
Database unavailable mid-edit
Redis unavailable
Stripe unavailable during checkout
Storage unavailable during upload
Network loss mid-autosave
Session expiry mid-edit
Corrupted schema on load
Plugin throwing repeatedly
```

**Browser matrix**

```
Latest Chrome · Edge · Firefox · Safari
Editor and published checkout in each
```

**Load**

```
1,000 concurrent checkout page views
100 concurrent payments
Sustained editor sessions
```

**Coverage:** 90% overall · 100% on every critical module

### Verification

```bash
pnpm test --coverage
pnpm test:e2e
pnpm test:visual
pnpm test:a11y
pnpm test:security
pnpm test:load
```

### Exit Criteria

```
✓ All universal criteria
✓ Coverage targets met everywhere, 100% on critical modules
✓ Every critical flow has passing E2E coverage
✓ Zero accessibility violations across the product
✓ Every security test passes
✓ Every chaos scenario degrades gracefully with no data loss
✓ All four browsers pass
✓ Load targets met
```

---

# Phase 21 — Production Release

**Depends on:** Phase 20

**Specs:** [deployment.md](./deployment.md) · [release-process.md](./release-process.md) · [observability.md](./observability.md) · [security.md](./security.md)

### Goal

Ship it, and be able to see, alert on, and reverse it.

### In Scope

```
Full CI/CD with staging and production gates
Canary deployment with automatic rollback
Complete monitoring, dashboards, SLOs, and alerts
Runbooks for every alert
Sentry and PostHog wired in production
Security audit
Backup and disaster recovery verification
Documentation review
Final QA
```

### Implementation Steps

```
1.  Complete CI/CD workflows for every environment
2.  Implement canary orchestration and automatic rollback comparison
3.  Wire Sentry and PostHog with release markers
4.  Build every dashboard in observability.md
5.  Configure every alert with a runbook link
6.  Write runbooks: rollback · migration failure · payment incident
                    · webhook backlog · canary failure
7.  Conduct the security audit against the security.md checklist
8.  Verify backups and perform a full restore drill
9.  Verify disaster recovery against RTO 30min / RPO 15min
10. Review all documentation against the shipped implementation
11. Run the full manual QA checklist
12. Execute a practice release, including a practice rollback
```

### Tests Required

**Deployment**

```
Staging deploy from main succeeds
Migrations apply on staging then production shape
Canary comparison detects an injected regression and rolls back
Rollback completes in under 5 minutes
Health checks gate traffic correctly
Feature flags toggle without a deploy
```

**Monitoring**

```
Every alert fires against a synthetic condition
Every alert has a runbook link that resolves
Release markers appear on every dashboard
Correlation id traceable end to end in production tooling
SLO calculations verified against known inputs
```

**Security audit**

```
Every item on the security.md release checklist verified
pnpm audit clean of high and critical
CSP validated in production
All security headers present
Stripe webhook verification confirmed live
Secrets confirmed absent from the codebase and client bundles
```

**Disaster recovery**

```
Backup restore drill completes within RTO
Data loss within RPO
Point-in-time recovery verified
```

**Coverage:** maintained

### Verification

```bash
pnpm check
# staging soak, 4 hours
# practice canary, then practice rollback
# restore drill
```

### Exit Criteria

```
✓ All universal criteria
✓ Full pipeline exercised end to end, including rollback
✓ Every alert tested and runbooked
✓ Security audit passed with no high or critical findings
✓ Backup restore drill succeeded within RTO and RPO
✓ Lighthouse ≥95 in production
✓ Documentation matches the implementation
✓ Manual QA checklist complete
```

---

# Phase 22 — Enterprise Features

**Depends on:** Phase 21

**Specs:** [security.md](./security.md) · [database.md](./database.md) · [pricing-billing.md](./pricing-billing.md) · [api-spec.md](./api-spec.md)

### Goal

Organizations, roles, and everything a larger customer requires.

### In Scope

```
Organizations and teams
Roles and granular permissions
Memberships and invitations (seat limits are enforced by Phase 25 entitlements)
Immutable audit logs with a viewer
Feature flag management UI
Public API with keys, scopes, and rate limits
SDK
White label
SSO / SAML
```

### Implementation Steps

```
1.  Add Organization and Membership entities; migrate existing users
2.  Implement the role and permission model
3.  Update every repository to scope by organization
4.  Implement invitations and membership management, calling assertCan("inviteSeat")
    (built in Phase 2) — seat limits are enforced from the first invitation
5.  Implement the audit log and its viewer
6.  Build the feature flag management UI
7.  Implement public API keys, scopes, and rate limits
8.  Publish the SDK
9.  Implement white-label configuration
10. Implement SSO / SAML
```

### Tests Required

**Unit**

```
Every role × every permission, allowed and denied
Invitation: create · accept · expire · revoke
Audit entries immutable, cannot be edited or deleted
API key: create · scope enforcement · rotate · revoke
```

**Integration**

```
Organization migration preserves every existing project
Cross-organization access denied at every endpoint
Role change takes effect immediately
Removing a member revokes access immediately
SSO login provisions correctly
```

**Security**

```
Privilege escalation blocked in every role combination
API key cannot exceed its scope
Audit log records every privileged action
```

**Coverage:** 90% · 100% on permissions

### Verification

```bash
pnpm test --filter=@checkout-studio/api -t "permissions" --coverage
pnpm test:e2e --filter=studio -g "organization"
pnpm test:security -g "escalation"
```

### Exit Criteria

```
✓ All universal criteria
✓ Existing users migrated with zero data loss
✓ Every role × permission combination tested
✓ No privilege escalation path exists
✓ Audit log immutable and complete
✓ Public API documented and rate limited
```

---

# Phase 23 — Marketplace

**Depends on:** Phase 21

**Specs:** [plugin-api.md](./plugin-api.md) · [template-system.md](./template-system.md) · [export-import.md](./export-import.md) · [security.md](./security.md)

### Goal

Third-party plugins, templates, and themes — safely.

### In Scope

```
Marketplace browse, search, and detail
Plugin installation, updates, and removal
Bundle signing and verification
Plugin sandboxing and permission prompts
Template and theme distribution
Ratings and reviews
Publisher accounts and submission review
Revenue share via Connect
```

### Implementation Steps

```
1.  Implement bundle signing and signature verification
2.  Implement plugin sandboxing and the permission prompt flow
3.  Implement install, update, and removal lifecycle
4.  Build marketplace browse and detail UI
5.  Implement publisher accounts and the submission pipeline
6.  Implement automated security scanning of submissions
7.  Implement ratings and reviews
8.  Implement revenue share payouts
```

### Tests Required

**Security — the dominant concern**

```
Unsigned bundle rejected
Invalid signature rejected
Revoked publisher certificate rejected
Plugin cannot exceed declared permissions
Plugin cannot access the database or secrets
Plugin cannot read another plugin's state
Malicious plugin fixture is contained by the sandbox
Plugin crash does not affect the editor
Removing a plugin unregisters everything it added
```

**Functional**

```
Install → components available in editor and renderer
Update → preserves user customization where documented
Version incompatibility disables the plugin automatically
Uninstall → nodes become core.unsupported, data preserved
Reinstall → nodes fully recover
```

**Coverage:** 90% · 100% on signing, verification, and sandboxing

### Verification

```bash
pnpm test --filter=@checkout-studio/plugin-sdk -t "marketplace" --coverage
pnpm test:security -g "plugin-sandbox"
pnpm test:e2e --filter=studio -g "marketplace"
```

### Exit Criteria

```
✓ All universal criteria
✓ No unsigned or unverified bundle can be installed
✓ Every malicious fixture is contained
✓ A plugin can never exceed its declared permissions
✓ Uninstalling never destroys user data
✓ One plugin can never crash the editor
```

---

# Phase 24 — Collaboration

**Depends on:** Phase 21

**Specs:** [state-management.md](./state-management.md) · [history-versioning.md](./history-versioning.md) · [editor-behavior.md](./editor-behavior.md)

### Goal

Real-time multi-user editing, replacing the session-lock model from Phase 5.

### In Scope

```
CRDT-backed shared document (Yjs)
Real-time synchronization
Presence: cursors, selections, avatars
Comments and threads
Activity feed
Automatic merge replacing choose-one conflict resolution
Offline editing with sync on reconnect
```

### Implementation Steps

```
1.  Introduce the CRDT layer beneath the existing store
2.  Implement synchronization transport
3.  Migrate node operations to CRDT-safe equivalents
4.  Implement presence
5.  Implement comments and threads
6.  Implement the activity feed
7.  Replace session locks with real-time coordination
8.  Implement offline editing and reconciliation
```

### Tests Required

**Convergence**

```
Two clients, concurrent edits → identical final state
Three or more clients
Concurrent edits to the same node
Concurrent edits to the same property
Concurrent move of the same node
Concurrent delete and edit
Offline edit then reconnect converges
Network partition and heal converges
Operations arriving out of order converge
```

**Integrity**

```
No sequence of concurrent operations produces an invalid tree
No concurrent operation can create a cycle
Undo remains per-user and correct under concurrency
History remains coherent
```

**Presence**

```
Cursors appear and disappear correctly
Disconnect clears presence within the timeout
Selection sharing accurate
```

**Coverage:** 100% on CRDT operations and convergence

### Verification

```bash
pnpm test --filter=@checkout-studio/editor -t "crdt" --coverage
pnpm test:convergence           # randomized concurrent-operation fuzzing
pnpm test:e2e -g "collaboration"
pnpm bench --filter=@checkout-studio/editor   # no single-user regression
```

### Exit Criteria

```
✓ All universal criteria
✓ Convergence proven across every concurrent scenario
✓ No concurrent operation sequence produces an invalid tree
✓ Per-user undo remains correct
✓ Offline edits reconcile without loss
✓ No regression in single-user editor performance
```

---

# Phase 25 — Version 1.0 Launch

**Depends on:** Phase 21, Phase 22 — plans sell seats, SSO, audit logs, and the public API, all built in Phase 22

**Specs:** [pricing-billing.md](./pricing-billing.md) · [release-process.md](./release-process.md) · [product-spec.md](./product-spec.md)

### Goal

Charge customers, support them, and launch publicly.

### In Scope

```
Stripe Billing integration for our own subscriptions
Entitlements (built in Phase 2) switch from the default Free plan to real subscriptions
Page-view metering and threshold notices (80 / 100 / 120%)
Dunning
Billing portal
Marketing site
Support portal and documentation site
Public launch
```

### Implementation Steps

```
1.  Bind the Phase 2 plan catalog to Stripe prices, versioned for grandfathering
2.  Resolve entitlements from Subscription records instead of the default Free plan
3.  Verify every billable action from earlier phases is routed through assertCan
4.  Implement page-view metering with bot filtering
5.  Implement threshold events and notifications
6.  Implement Stripe Checkout and Customer Portal integration
7.  Implement the billing webhook endpoint (separate from Connect)
8.  Implement the dunning schedule
9.  Implement downgrade enforcement
10. Implement nightly reconciliation against Stripe
11. Build the billing UI
12. Build marketing site, support portal, and docs site
13. Execute the launch
```

### Tests Required

**100% coverage on billing.**

```
Entitlements     every plan · every status · enterprise overrides
                 · restriction layering · cache invalidation on webhook
Enforcement      every billable action at, below, and above its limit
                 · error carries limit, current, and suggested plan
Metering         increment · bot filtering · dedup · flush · cycle reset
                 · threshold events at 80/100/120
                 · Redis unavailable does not block a page view
Lifecycle        subscribe · upgrade (prorated) · downgrade (period end)
                 · cancel · reactivate · trial start · trial expiry
Downgrade        over-limit enforcement unpublishes, never deletes
                 · fully reversible on upgrade
Dunning          all 21 days · recovery at each stage
                 · published pages serve until day 21
Webhooks         signature · replay · duplicate · out-of-order
                 · unknown customer
Reconciliation   plan, status, and period drift; Stripe wins
Authorization    Administrator denied billing access · Editor denied · cross-tenant denied
Isolation        a billing failure never affects merchant payments
Export           available on every plan, in every status  [RELEASE BLOCKER]
```

**Coverage:** 100%

### Exit Criteria

```
✓ All universal criteria
✓ 100% coverage on billing
✓ No customer can be charged an amount they did not agree to
✓ No billing state can delete or withhold a customer's work
✓ Export available on every plan and status, proven by test
✓ Billing is fully isolated from Connect — separate endpoints and secrets
✓ Entitlements resolve in under 5ms
✓ Every limit enforced server-side through exactly one function
✓ Cancellation takes no more clicks than subscribing
```

---

# Cross-Phase Rules

## Never Defer These

Some things are cheap during a phase and expensive afterwards. They are never postponed.

```
Tests            written alongside, never "in Phase 20"
Accessibility    built in, never retrofitted
Error handling   every path, at the time
Types            strict, no `any`, no suppressions
Telemetry        added with the code it measures
Documentation    updated in the same commit
```

Phase 20 exists to close gaps, not to be where testing happens.

## Parallelizable Work

Some phases are independent and may run concurrently with more than one engineer:

```
Phase 3 (Design System)    ∥  Phase 2 (Infrastructure)
Phase 3 (Design System)    ∥  Phase 5 (State Engine)
Phase 3 (Design System)    ∥  Phase 6 (Renderer)
Phase 12 (Inspector)       ∥  Phase 13 (Stripe)
Phase 17 (AI Assistant)    ∥  Phases 13–16
Phase 23 (Marketplace)     ∥  Phase 24 (Collaboration)  ∥  Phase 22 (Enterprise)
```

Everything else is strictly sequential. The dependency column in the tracker is authoritative.

## When a Phase Reveals a Spec Gap

```
Stop.
Do not guess.
Do not implement "something reasonable".

Raise the gap.
Resolve it in /docs.
Then continue.
```

A specification gap discovered during implementation is a cheap problem. The same gap discovered after three dependent phases were built on a guess is not.

## When a Phase Grows

If a phase's scope expands during implementation:

```
Is the new work required for this phase's Exit Criteria?
   yes → it was always in scope; do it
   no  → capture it as an issue for a later phase; do not do it now
```

Scope creep across phase boundaries is the primary way a phased plan becomes a single unbounded phase.

---

# Phase Completion Report

Report this format when a phase is finished, then stop.

```markdown
## Phase N — <Name> — Complete

### Implemented

- …

### Files Created

- …

### Files Modified

- …

### Tests Added

Unit: N tests
Integration: N tests
E2E: N tests
Coverage: statements% / branches% / functions% / lines%

### Verification

pnpm lint ✓
pnpm typecheck ✓
pnpm test ✓ (coverage: N%)
pnpm test:e2e ✓
pnpm build ✓

### Exit Criteria

- [x] every criterion, individually checked

### Performance

<measurements against this phase's targets>

### Documentation Updated

- …

### Notes / Concerns

<anything the next phase should know>

### Status

Awaiting approval before Phase N+1.
```

---

# Success Criteria

The phase plan is working when:

- Every phase begins with unambiguous scope and ends with verified exit criteria.
- No phase is marked complete with a failing test, a coverage gap, or an unmet budget.
- Tests are written during each phase, never deferred to Phase 20.
- Every phase leaves the repository in a shippable state.
- A specification gap stops work rather than producing a guess.
- The progress tracker always reflects reality.
- Work stops at each phase boundary and waits for approval.

---

# Philosophy

Phases exist to make an enormous project finite.

The alternative — building everything at once, integrating at the end — fails in a specific and predictable way: the integration reveals that decisions made in month one were wrong, and by then a dozen things depend on them. Phasing converts that single catastrophic discovery into twenty-five small ones, each caught while it is still cheap.

The discipline that makes it work is the exit criteria. A phase that is "basically done" is a phase whose remaining ten percent will be discovered later, by someone else, usually in production. The criteria are deliberately strict and deliberately mechanical, so that "done" is a fact rather than an opinion.

And the tests are what make each phase a foundation rather than a floor that happens to be holding.

Build one phase.

Prove it.

Then build the next.
