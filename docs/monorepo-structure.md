# Checkout Studio Monorepo Structure

**Version:** 1.0

**Status:** Repository & Workspace Architecture

---

# Purpose

The repository layout is an architectural artifact, not a filing convention.

Where code lives determines what can import what. What can import what determines whether the renderer stays independent of the editor, whether plugins remain replaceable, and whether a second product can be built on the same engine without a rewrite.

This document defines:

- Every workspace in the monorepo and its single responsibility.
- The dependency rules that keep layers separated, and how they are mechanically enforced.
- The build, cache, and task pipeline.
- How to add a package, a plugin, or an application.
- How the structure supports the platform's expansion beyond checkout.

The folder structure is the compiled form of the architecture in [architecture.md](./architecture.md).

---

# Overview

Checkout Studio is a **pnpm workspace** orchestrated by **Turborepo**.

```
checkout-studio/
├── apps/           deployable applications
├── packages/       shared libraries
├── plugins/        first-party plugins
├── docs/           this documentation
├── scripts/        repository tooling
└── config files    workspace-level configuration
```

Two rules govern the entire layout.

```
apps      may depend on packages and plugins.
packages  may depend on packages (acyclically) only.
plugins   may depend on packages only.

Nothing may depend on an app. Ever.
```

An app is a leaf. The moment something imports from an app, the boundary that keeps the renderer independent of the editor has been broken.

---

# Architecture

## Layer Model

Packages are stratified. A package may only depend on packages in a **strictly lower** layer. Packages in the same layer never import one another.

```
┌────────────────────────────────────────────────────────────────┐
│  LAYER 6 — APPLICATIONS                                        │
│  apps/studio          apps/renderer          apps/docs         │
└────────────────────────────────┬───────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│  LAYER 5 — COMPOSITION                                         │
│  @checkout-studio/editor        (the visual editing engine)    │
│  @checkout-studio/api           (server contracts + handlers)  │
│  plugins/*                      (component + behavior plugins) │
└────────────────────────────────┬───────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│  LAYER 4 — RENDERING                                           │
│  @checkout-studio/renderer      (the rendering engine)         │
└────────────────────────────────┬───────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│  LAYER 3 — DOMAIN & PRESENTATION                               │
│  @checkout-studio/plugin-sdk    (plugin contracts + registry)  │
│  @checkout-studio/database      (Prisma client + repositories) │
│  @checkout-studio/cache         (Redis, idempotency, limits)   │
│  @checkout-studio/ui            (Studio component library)     │
│  @checkout-studio/hooks         (shared React hooks)           │
└────────────────────────────────┬───────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│  LAYER 2 — CORE                                                │
│  @checkout-studio/schema        (schema, validation, migration)│
│  @checkout-studio/design-system (Studio tokens and themes)     │
│  @checkout-studio/observability (logging, metrics, tracing)    │
└────────────────────────────────┬───────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│  LAYER 1 — FOUNDATION                                          │
│  @checkout-studio/types         (shared TypeScript types)      │
│  @checkout-studio/utils         (pure utilities, error model)  │
└────────────────────────────────┬───────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│  LAYER 0 — TOOLING                                             │
│  @checkout-studio/config        (eslint, tsconfig, tailwind)   │
└────────────────────────────────────────────────────────────────┘
```

The critical property of this stratification is the rule in [CLAUDE.md](../CLAUDE.md) and [architecture.md](./architecture.md):

> The renderer must never depend on builder code.

The dependency between the two engines is **one-way**.

```
editor ──────▶ renderer        allowed    the canvas renders through
                                          the renderer's editor-preview mode

renderer ──X──▶ editor         forbidden  the published checkout never
                                          carries a byte of editor code
```

The one-way edge is deliberate. The canvas and the published page share a single rendering path, so what a user edits is exactly what ships. A separate canvas renderer would drift from the real one within months, and every drift is a WYSIWYG bug.

The renderer sits alone in Layer 4 precisely so that the layering itself forbids the reverse edge: nothing in Layer 4 can import Layer 5.

## Dependency Graph

```
                              apps/studio
                                   │
        ┌──────────────┬───────────┼─────────────┬─────────────┐
        ▼              ▼           ▼             ▼             ▼
      editor          api      plugins/*         ui          hooks
        │              │           │             │
        ├─▶ ui         ├─▶ database│             ▼
        ├─▶ hooks      │           ├─▶ ui    design-system
        │              │           │   (editor entries only)
        └──────┬───────┴─────┬─────┘
               ▼             │
            renderer         │
               │             │
               └──────┬──────┘
                      ▼
                  plugin-sdk
                      │
                      ▼
                   schema ─────────▶ types · utils
                                          ▲
                   observability ─────────┘

   Every package also depends on config (Layer 0) for tooling.


                          apps/renderer
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
       renderer        plugins/*/renderer            api
          │                     │                     │
          └──────────┬──────────┘                     │
                     ▼                                ▼
     plugin-sdk · schema · utils · observability   database
```

`api → renderer` exists for static export and publish pre-warming. `renderer` reaches neither `ui` nor `database` by any path.

Edges forbidden regardless of layering, and enforced by lint:

```
renderer   → editor · ui · design-system · database · api
plugins    → editor · database · api
ui         → database · api
schema     → anything above Layer 1
```

Note what `apps/renderer` does **not** import: `editor`, `ui`, or `design-system`.

The public checkout ships without a single byte of editor code. This is why the published bundle budget of 150 KB in [performance.md](./performance.md) is achievable at all.

---

# Design Principles

**One package, one responsibility.**

If a package's description needs the word "and", it is two packages.

**Dependencies point downward, always.**

An upward import, or a lateral import between packages in the same layer, is a design error caught by lint before review.

**The schema is the only shared language.**

The editor hands the renderer a schema, exactly as the published route does. No editor state, store, or type ever crosses into the renderer.

**Packages are libraries, apps are deployments.**

A package has no environment variables, no routes, no `.env`, and no knowledge of where it runs.

**Public API through the index.**

Every package exports through `src/index.ts`. Deep imports into another package's internals are forbidden and lint-enforced.

**Internal versioning.**

Workspace packages use `workspace:*`. There is no internal semver dance; the repository is always internally consistent.

**Configuration is a package.**

ESLint, TypeScript, Tailwind, and Prettier configurations live in `@checkout-studio/config` and are extended, never copied.

**Everything is cacheable.**

Every task declares its inputs and outputs so Turborepo can skip it. An untracked side effect is a broken cache.

---

# Repository Layout

```
checkout-studio/
│
├── apps/
│   ├── studio/                    Next.js — the editor + dashboard
│   ├── renderer/                  Next.js — published checkouts
│   └── docs/                      Documentation site (Phase 21)
│
├── packages/
│   ├── config/                    Shared tooling configuration
│   ├── types/                     Shared TypeScript types
│   ├── utils/                     Pure utilities + error model
│   ├── observability/             Logging, metrics, tracing, RUM
│   ├── schema/                    Schema, validation, migration
│   ├── design-system/             Tokens, themes, Tailwind preset
│   ├── ui/                        Component library (shadcn/ui based)
│   ├── hooks/                     Shared React hooks
│   ├── database/                  Prisma schema, client, repositories
│   ├── cache/                     Redis client, cache, idempotency, rate limits
│   ├── api/                       API contracts, handlers, services
│   ├── plugin-sdk/                Plugin contracts + registries
│   ├── editor/                    Visual editing engine
│   └── renderer/                  Rendering engine
│
├── plugins/
│   ├── core-layout/               Section, Container, Grid, Stack…
│   ├── core-content/              Heading, Text, Image, Button…
│   ├── core-embed/                HTML Block, Code Block, Embed, Lottie
│   ├── core-forms/                Input, Select, Address…
│   ├── checkout/                  Payment Element, Order Summary…
│   ├── marketing/                 FAQ, Countdown, Testimonials…
│   └── ai/                        AI assistant surfaces
│
├── docs/                          Architecture documentation
├── scripts/                       Repository tooling
│
├── .github/workflows/             CI pipelines
├── .husky/                        Git hooks
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
└── README.md
```

This extends the folder structure introduced in [architecture.md](./architecture.md) with the supporting packages every workspace of this shape eventually requires — `config`, `observability`, `plugin-sdk` — and promotes plugins to a top-level directory, since [plugin-api.md](./plugin-api.md) makes them the primary extension mechanism rather than a subdirectory of shared code.

---

# Applications

## apps/studio

The editor and dashboard. The product users log into.

```
apps/studio/
├── src/
│   ├── app/
│   │   ├── (marketing)/           Public pages
│   │   ├── (auth)/                Clerk flows
│   │   ├── (dashboard)/
│   │   │   ├── projects/
│   │   │   ├── templates/
│   │   │   ├── assets/
│   │   │   ├── orders/
│   │   │   ├── analytics/
│   │   │   └── settings/
│   │   ├── (studio)/
│   │   │   └── projects/[projectId]/pages/[pageId]/
│   │   ├── api/
│   │   │   └── v1/                Route handlers → @checkout-studio/api
│   │   └── layout.tsx
│   ├── features/                  App-specific composition only
│   ├── server/                    Server actions
│   ├── lib/                       App-local helpers
│   └── styles/
├── public/
├── next.config.ts
├── tailwind.config.ts             extends the design-system preset
└── package.json
```

Rule: `apps/studio/src/features/` composes packages. It never implements engine logic.

If a feature file contains node-tree manipulation, it belongs in `@checkout-studio/editor`.

## apps/renderer

The public checkout host. Optimized ruthlessly for the customer-facing path.

```
apps/renderer/
├── src/
│   ├── app/
│   │   ├── [domain]/[slug]/       Published checkout pages
│   │   ├── preview/[token]/       Authenticated draft preview
│   │   ├── embed/[id]/            Embed iframe target
│   │   └── api/
│   │       ├── checkout/          Payment intents, orders
│   │       └── webhooks/stripe/
│   ├── lib/
│   └── embed/
│       └── embed.ts               Compiles to /embed.js
├── next.config.ts
└── package.json
```

Constraints, enforced in CI

```
Bundle budget (first-party)    < 150 KB gzipped
Forbidden dependencies         editor, ui, design-system
Forbidden imports              anything from apps/studio
```

Stripe.js is a deferred, interaction-triggered third-party dependency measured separately, per [stripe-integration.md](./stripe-integration.md).

The bundle budget is a build failure, not a warning. It is the mechanism that keeps the checkout fast eighteen months from now, when nobody remembers the rule.

---

# Packages

## @checkout-studio/config

Shared tooling configuration. Depends on nothing.

```
packages/config/
├── layers.js               THE LAYER MODEL, AS DATA — single source of truth
├── eslint/
│   ├── base.js
│   ├── react.js
│   ├── next.js
│   └── boundaries.js       generated from layers.js
├── typescript/
│   ├── base.json
│   ├── react-library.json
│   └── next.json
├── tailwind/
│   └── base.css            Tailwind v4 is configured in CSS, not in a JS preset
├── prettier/
├── vitest/
├── types/                  hand-written .d.ts for these JS modules
└── tests/                  the layer model and its enforcement are tested
```

`layers.js` is read by the ESLint boundaries preset, the dependency-cruiser configuration, the package generator, and `scripts/verify-boundaries.mjs`. The rule that documents the architecture and the rule that enforces it cannot drift apart, because they are the same file.

Every other package extends these. There is exactly one ESLint rule set in the repository.

## @checkout-studio/types

Shared TypeScript types with zero runtime output.

```
packages/types/src/
├── api.ts           ApiResponse, pagination, filters
├── entities.ts      Project, Page, Revision, Order, Asset (API DTOs)
└── index.ts
```

Every type has exactly one owner:

```
Schema, Node, Styles, Visibility, Theme   → packages/schema   (inferred from its Zod schemas)
PluginManifest, Command, registrations    → packages/plugin-sdk
Selection, Viewport, History              → packages/editor
API envelope and entity DTOs              → packages/types
```

`types` holds only what has no natural owner. It never re-declares a type another package owns — two declarations of one shape is how they drift.

Rule: types only. A single `const` here becomes a runtime dependency for every package in the repository.

## @checkout-studio/utils

Pure, dependency-free utilities.

```
packages/utils/src/
├── errors/          AppError, catalog, normalization, retry
├── id/              Prefixed id generation
├── object/          deepMerge, pick, omit, normalize
├── array/           move, insertAt, groupBy
├── string/          slugify, truncate, kebab
├── format/          currency, date, bytes
├── color/           OKLCH conversion, scale derivation, contrast
├── async/           debounce, throttle, retry, withTimeout
└── validation/      shared Zod primitives
```

Rule: no React, no DOM, no Node built-ins. Everything here runs in a browser, on a server, and in a test with equal indifference.

The error model lives here because it is consumed by every layer — see [error-handling.md](./error-handling.md).

## @checkout-studio/observability

Logging, metrics, tracing, RUM, and analytics. Structure defined in [observability.md](./observability.md).

Rule: the only package permitted to import a telemetry vendor SDK.

## @checkout-studio/schema

The most important package in the repository.

```
packages/schema/src/
├── types/           Canonical schema types
├── validation/
│   ├── structural.ts     Zod shape validation
│   ├── referential.ts    orphans, cycles, duplicate ids
│   └── semantic.ts       runs component rules supplied by an injected validator
│                         registry — the schema package contains no component rules
├── migration/
│   ├── registry.ts
│   ├── migrations/
│   │   ├── 1.0.0-to-1.1.0.ts
│   │   └── 1.1.0-to-2.0.0.ts
│   └── migrate.ts
├── operations/      Pure tree operations
│   ├── insert.ts  move.ts  remove.ts  duplicate.ts
│   ├── wrap.ts    unwrap.ts
│   └── traverse.ts
├── normalize/       Canonical form for hashing and diffing
├── serialize/       toJSON, fromJSON, compress
└── index.ts
```

Constraints

```
Dependencies: zod and @checkout-studio/utils only
No React
No DOM
Every operation is a pure function: (schema, args) → schema
```

Because tree operations are pure and live here, the editor, the AI action executor, the importer, and the template installer all share exactly one implementation of "duplicate this subtree with new ids".

## @checkout-studio/design-system

Tokens and theming primitives. Implements [design-system.md](./design-system.md) and the Studio half of [theme-system.md](./theme-system.md).

```
packages/design-system/src/
├── tokens/          primitives, semantics, components
├── themes/          light, dark, high-contrast
├── tailwind/        tokens.css — the @theme block Tailwind v4 consumes
├── css/             variables.css, reset.css
└── motion/          durations, easings
```

Rule: no components. This package produces values, not UI.

## @checkout-studio/ui

The component library. Implements [ui-guidelines.md](./ui-guidelines.md).

```
packages/ui/src/
├── primitives/      Button, Input, Select, Checkbox, Dialog, Popover…
├── composites/      DataTable, EmptyState, CommandPalette, FileUpload…
├── feedback/        Toast, Alert, Skeleton, ErrorState, Spinner
├── layout/          Panel, ResizablePanel, Splitter, ScrollArea
├── errors/          Error boundaries (see error-handling.md)
└── index.ts
```

Rules

- No business logic. No data fetching. No knowledge of projects or pages.
- Every component is fully controllable and fully accessible.
- Every component consumes design tokens exclusively.

If a UI component imports `@checkout-studio/database`, the layering has failed.

## @checkout-studio/hooks

React hooks shared across apps.

```
useDebounce  useThrottle  useLocalStorage  useMediaQuery
useKeyboardShortcut  useResizeObserver  useIntersection
useClickOutside  useHotkeyScope  useOnlineStatus
```

Rule: generic only. `useSelectedNode` belongs in `@checkout-studio/editor`.

## @checkout-studio/database

Prisma schema, generated client, and repositories. Implements [database.md](./database.md).

```
packages/database/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── src/
    ├── client.ts          Singleton, pooled
    ├── repositories/      project, page, revision, order, asset, theme…
    ├── transactions/      publish, importBundle, duplicateProject
    └── index.ts
```

Rules

- Every repository method takes a tenant context and enforces ownership. Multi-tenancy is not optional and is not the caller's responsibility.
- Raw SQL requires an explicit, reviewed exemption.
- No repository returns a Prisma model directly; each maps to a type from `@checkout-studio/types`.

## @checkout-studio/api

Server contracts, handlers, and services. Implements [api-spec.md](./api-spec.md).

```
packages/api/src/
├── contracts/       Zod request/response schemas per resource
├── handlers/        Route handler implementations
├── services/        Business logic
│   ├── publishing.ts  revisions.ts  assets.ts
│   ├── stripe.ts      orders.ts     templates.ts
│   └── ai.ts
├── middleware/      auth, rateLimit, validate, telemetry, errors
├── errors/          withErrorHandling, toApiResponse
└── index.ts
```

Rule: `apps/studio/src/app/api/v1/**` files are three lines. They import a handler and export it. All logic lives here, so it is testable without a running Next.js server.

Rule: services that need plugins — publish validation, import validation, static export — receive a populated plugin-sdk registry by dependency injection. `api` and `plugins/*` share Layer 5 and never import each other; each application builds the registry once at startup and passes it in.

## @checkout-studio/plugin-sdk

The contracts every plugin implements and the registries the engines read. Implements [plugin-api.md](./plugin-api.md).

```
packages/plugin-sdk/src/
├── manifest.ts          PluginManifest, permissions, compatibility
├── lifecycle.ts         register → initialize → ready → dispose  (plugin-api.md)
│                        a plugin module exports activate(api) and deactivate();
│                        activate runs during initialize, deactivate during dispose
├── registries/
│   ├── component.ts     type → definition
│   ├── renderer.ts      type → React component
│   ├── inspector.ts     type → property sections
│   ├── command.ts       command registry
│   ├── themeSlot.ts     component theme slot schemas and defaults
│   ├── provider.ts      plugin-contributed render providers
│   ├── variable.ts      plugin-supplied variable sources ($var)
│   ├── shortcut.ts      keymap registry
│   ├── validator.ts     validation rules
│   └── toolbar.ts
├── context/             PluginApi surface
├── permissions/
└── index.ts
```

This package is the reason the editor "knows nothing about checkout logic". Both `editor` and `renderer` depend on `plugin-sdk`; neither depends on any specific plugin. Plugins are registered at runtime by the applications.

## @checkout-studio/editor

The visual editing engine. Implements [state-management.md](./state-management.md) and [editor-behavior.md](./editor-behavior.md).

```
packages/editor/src/
├── store/
│   ├── createStore.ts
│   ├── slices/          nodes, selection, viewport, history,
│   │                    clipboard, theme, assets, publishing
│   └── selectors/
├── commands/            The command catalog
├── keyboard/            Keymap registry (see keyboard-shortcuts.md)
├── history/             Undo/redo, patches, grouping
├── dnd/                 dnd-kit integration, collision, indicators
├── canvas/              Viewport, overlays, guides, snapping
├── inspector/           Dynamic property panel construction
├── layers/              Virtualized tree
├── autosave/            Debounce, queue, offline persistence
├── clipboard/
├── transactions/        Atomic multi-step mutations
└── index.ts
```

Rule: the editor imports `plugin-sdk` for registries, `schema` for tree operations, and `renderer` for the canvas's editor-preview mode. It never imports a plugin directly — plugins are registered at runtime by `apps/studio`.

## @checkout-studio/renderer

The rendering engine. Implements [renderer.md](./renderer.md).

```
packages/renderer/src/
├── runtime/         CheckoutRenderer, RenderNode, resolution
├── registry/        Component resolution from plugin-sdk
├── providers/       Theme and Variable providers, plus the slot for plugin providers
├── styles/          Theme compilation → CSS variables
├── hooks/           Renderer-side hooks
├── fallback/        Unsupported and error components
├── modes/           ssr, static, embed, preview
├── utils/
└── index.ts
```

Constraints, enforced in CI

```
Forbidden: @checkout-studio/editor
Forbidden: @checkout-studio/ui
Forbidden: @checkout-studio/design-system
Forbidden: zustand, dnd-kit, framer-motion
Bundle:    < 150 KB gzipped
```

The renderer is deliberately impoverished. Every dependency it lacks is a dependency the customer's browser does not download.

---

# Plugins

First-party plugins live at the top level because they are products in their own right, not shared utilities.

```
plugins/checkout/
├── src/
│   ├── manifest.ts
│   ├── index.ts               activate(api) / deactivate() — see lifecycle.ts
│   ├── components/
│   │   ├── payment-element/
│   │   │   ├── definition.ts      registration metadata
│   │   │   ├── Renderer.tsx       renderer-side component
│   │   │   ├── properties.ts      declarative property definitions
│   │   │   ├── validation.ts
│   │   │   └── defaults.ts
│   │   ├── order-summary/
│   │   ├── coupon/
│   │   └── order-bump/
│   ├── commands/
│   ├── validators/
│   └── locale/
└── package.json
```

The `definition / Renderer / properties` triple is the standard shape.

`properties.ts` is data, not UI. The inspector builds itself from it, per [architecture.md](./architecture.md) — no component ever ships a hand-built inspector panel.

The split is also what allows tree-shaking: the renderer bundle receives `definition.ts` and `Renderer.tsx`, and never `properties.ts` or any other editor-only code.

```json
{
  "name": "@checkout-studio/plugin-checkout",
  "exports": {
    ".": "./src/index.ts",
    "./renderer": "./src/renderer.ts",
    "./editor": "./src/editor.ts"
  }
}
```

`apps/renderer` imports `@checkout-studio/plugin-checkout/renderer` only.

---

# Boundary Enforcement

Rules that live only in documentation are rules that will be broken. Every constraint above is mechanically enforced.

## ESLint Boundaries

Each package's `eslint.config.js` composes the shared preset with a boundary configuration generated for that package:

```js
// packages/renderer/eslint.config.js
import { reactConfig } from "@checkout-studio/config/eslint/react"
import { boundariesConfig } from "@checkout-studio/config/eslint/boundaries"

export default [...reactConfig, boundariesConfig("renderer")]
```

`boundariesConfig` derives the forbidden set from `layers.js` and emits a core `no-restricted-imports` rule — no plugin required — where every message carries the reason the boundary exists:

```
packages/renderer/src/canvas.ts
  1:1  error  renderer may not import @checkout-studio/editor.
              The renderer must never depend on builder code, Studio UI, or
              server code. The published checkout ships without a byte of it.
```

It also forbids deep imports (`@checkout-studio/*/src/*`) and any import from an application.

The rules are tested against real source text in `packages/config/tests/boundaries.test.js`: a rule nobody has watched fail is a rule nobody should trust.

## Dependency Cruiser

A second, graph-level check runs in CI.

```
✓ No circular dependencies anywhere
✓ No layer violations
✓ No orphaned modules
✓ No package depends on an app
✓ Renderer dependency set matches the allowlist exactly
```

## Bundle Budgets

```json
{
  "budgets": [
    { "app": "renderer", "metric": "gzip", "warn": "150kb", "max": "175kb" },
    { "app": "studio", "metric": "gzip", "warn": "250kb", "max": "350kb" }
  ]
}
```

Budgets measure **first-party** JavaScript. Deferred third-party scripts — Stripe.js above all — are reported as a separate line and are not counted against these numbers.

`warn` is the target from [performance.md](./performance.md). `max` is the hard ceiling.

Exceeding a warn threshold reports in the pull request. Exceeding a maximum fails the build.

This implements the budgets in [performance.md](./performance.md) as a gate rather than an aspiration.

---

# Task Pipeline

```jsonc
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "!**/*.test.*", "!**/e2e/**", "!**/*.md"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "env": ["NEXT_PUBLIC_*"],
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "!**/*.md"],
      "outputs": [],
    },
    "lint": { "inputs": ["$TURBO_DEFAULT$", "!**/*.md"], "outputs": [] },
    "test": { "inputs": ["$TURBO_DEFAULT$", "!**/*.md"], "outputs": [] },
    "test:coverage": { "inputs": ["$TURBO_DEFAULT$", "!**/*.md"], "outputs": ["coverage/**"] },
    "test:e2e": { "dependsOn": ["build"], "outputs": ["playwright-report/**", "test-results/**"] },
    "clean": { "cache": false },
    "dev": { "cache": false, "persistent": true },
  },
  "globalDependencies": [".env.example"],
  "globalEnv": ["NODE_ENV", "CI"],
}
```

`$TURBO_DEFAULT$` includes every git-tracked file in the package — `next.config.ts`, `tailwind.config.ts`, `public/**`, the Prisma schema — rather than an allowlist that silently misses one. Only build-time environment variables are listed in `env`; runtime secrets never affect a build and so never belong there.

## Execution Order

Packages have no build step, so `build` runs only for the applications. `lint`, `typecheck` and `test` run per package and are cached independently, which means they run in parallel across the whole workspace:

```
lint · typecheck · test        every package and app, in parallel
     ↓
build                          apps/studio · apps/renderer, in parallel
```

Turborepo hashes each task's inputs against the Git index. A no-op run is a full cache hit:

```
Tasks:  2 successful, 2 total
Cached: 2 cached, 2 total
Time:   9ms >>> FULL TURBO
```

A glob in `globalDependencies` is hashed directly, ignoring `.gitignore`. Pointing one at a package directory therefore hashes Turborepo's own task logs, which contain timings — and every run misses. Shared configuration is already accounted for through the dependency graph, so it does not belong there.

Caching depends on files being tracked by Git — Turborepo uses Git to know what to hash and what to ignore. In a working tree where nothing is tracked yet, every run is a miss.

## Caching

```
Local     .turbo/cache
Remote    Vercel Remote Cache, shared across CI and developers
```

Cache correctness depends on complete input declarations. A task that reads an undeclared file will produce a stale result on someone else's machine, and that class of bug is extremely expensive to diagnose.

Rule: if a task reads it, the task declares it.

## Scripts

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:e2e": "turbo test:e2e",
    "db:generate": "turbo db:generate",
    "db:migrate": "pnpm --filter @checkout-studio/database prisma migrate dev",
    "db:studio": "pnpm --filter @checkout-studio/database prisma studio",
    "clean": "turbo clean && rm -rf node_modules",
    "graph": "depcruise --config .dependency-cruiser.cjs --output-type dot packages apps plugins > graph.dot",
    "check": "turbo lint typecheck test build"
  }
}
```

`pnpm check` is the local equivalent of CI. Running it before pushing is the expectation set in [contributing.md](./contributing.md).

---

# TypeScript Configuration

Packages are consumed as TypeScript source and have no build step: `exports` points at `src/index.ts`, and each application transpiles what it imports. There is no `dist/`, no intermediate build, and nothing to rebuild between editing a package and seeing the change.

```jsonc
// packages/editor/tsconfig.json
{
  "extends": "@checkout-studio/config/typescript/react-library.json",
  "include": ["src/**/*", "tests/**/*", "*.config.ts"],
}
```

Each package typechecks itself with `tsc --noEmit`, pulling its dependencies' source through their `exports`. Because the packages are source-exported rather than compiled, project references and `composite` do not apply, and the dependency graph is enforced instead by the ESLint boundaries preset and by dependency-cruiser over the resolved graph — both generated from `layers.js`, and both stricter than the compiler would be.

Strict mode is mandatory everywhere, per [coding-standards.md](./coding-standards.md).

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "verbatimModuleSyntax": true,
}
```

---

# Package Conventions

## package.json Shape

```json
{
  "name": "@checkout-studio/editor",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf coverage .turbo"
  },
  "dependencies": {
    "@checkout-studio/renderer": "workspace:*",
    "@checkout-studio/plugin-sdk": "workspace:*",
    "@checkout-studio/ui": "workspace:*",
    "@checkout-studio/hooks": "workspace:*",
    "@checkout-studio/schema": "workspace:*",
    "@checkout-studio/types": "workspace:*",
    "@checkout-studio/utils": "workspace:*"
  },
  "peerDependencies": { "react": "^19.0.0" }
}
```

Rules

- Internal dependencies always `workspace:*`.
- Packages have no `build` script. Only applications build.
- `react` and `react-dom` are always peer dependencies in libraries. Bundling React twice is a class of bug that costs days.
- Packages are `private: true` until there is a decision to publish.
- Source is exported directly; apps transpile. This keeps the developer experience fast and stack traces honest.

## Naming

```
Packages       @checkout-studio/<kebab-case>
Directories    kebab-case
React files    PascalCase.tsx
Other files    camelCase.ts
Tests          <name>.test.ts, colocated
Types          PascalCase
Constants      SCREAMING_SNAKE_CASE
```

Consistent with [coding-standards.md](./coding-standards.md).

## Barrel Files

Every package has exactly one `src/index.ts` that exports its public surface explicitly.

```ts
// Good — explicit, tree-shakeable, reviewable
export { createEditorStore } from "./store/createStore"
export { useSelection } from "./store/selectors/useSelection"
export type { EditorStore, SelectionState } from "./types"

// Forbidden — opaque surface, defeats tree-shaking
export * from "./store"
```

The public surface should be reviewable in a single screen. When it stops fitting, the package has grown a second responsibility.

---

# Workflows

## Adding a package

```
1. node scripts/create-package.ts <name> --deps a,b [--react]
2. Generated: package.json, tsconfig.json, src/index.ts, README.md, test setup
3. Declare dependencies (workspace:* only, layer ≤ own layer)
4. Add tsconfig project references
5. Add the layer rule to boundaries.js if it introduces a new constraint
6. pnpm install
7. pnpm check
```

Two questions gate the decision:

- Can this package's responsibility be stated in one sentence without "and"?
- Is it used by at least two consumers, or does it enforce a boundary?

If neither, it belongs inside an existing package.

## Adding a plugin

```
1. scripts/create-plugin.ts <name>
2. Author manifest.ts — id, version, permissions, compatibility
3. Add components with the definition / Renderer / properties triple
4. Split exports: ./renderer and ./editor
5. Register in the plugin catalog
6. Verify the renderer bundle did not grow beyond budget
7. pnpm check
```

## Adding a schema migration

```
1. Bump the schema version in packages/schema
2. Add packages/schema/src/migration/migrations/<from>-to-<to>.ts
3. Register it in the migration registry
4. Add fixtures for both versions
5. Test: migrate, validate, and round-trip
6. Confirm the renderer handles both versions
7. Document in the migration table
```

Migrations are append-only. An existing migration is never edited, because revisions in production already depend on its exact behavior.

## Local development

```
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

```
apps/studio     → http://localhost:3000
apps/renderer   → http://localhost:3001
```

Turborepo watches all packages. Editing `@checkout-studio/schema` hot-reloads both applications.

---

# Best Practices

**Put it in the lowest layer that works.**

A utility in `utils` is available everywhere. The same utility in `editor` is unavailable to the renderer, forever.

**Never reach for a deep import to solve a layering problem.**

If you need something a package does not export, either it should be exported or the dependency is wrong. The deep import is never the answer.

**Keep the renderer's dependency list short enough to memorize.**

It is the one list in the repository worth defending in every review.

**Colocate tests with source.**

`Button.tsx` and `Button.test.tsx` live together. A separate test tree drifts.

**Declare every task input.**

An undeclared input is a cache poisoning bug waiting for a teammate.

**Write the package README as you create the package.**

One paragraph: what it does, what it does not do, what it depends on.

**Watch the dependency graph.**

`pnpm graph` should stay legible. When it stops being legible, the architecture has stopped being one.

**Let the compiler enforce the architecture.**

Project references, boundary lint, and bundle budgets catch violations in seconds. Code review catches them in days, or not at all.

---

# Performance Considerations

| Operation                | Target  |
| ------------------------ | ------- |
| Cold full build          | < 4 min |
| Warm build (cached)      | < 30 s  |
| Incremental typecheck    | < 10 s  |
| Single package test      | < 5 s   |
| Dev server cold start    | < 15 s  |
| HMR after a package edit | < 2 s   |
| CI full pipeline         | < 8 min |

Techniques

**Remote caching.**

CI and every developer share a cache. A branch that changes only `apps/studio` never rebuilds `renderer` or `schema`.

**Scoped tasks.**

```
turbo build --filter=@checkout-studio/editor...
turbo test  --filter=[origin/main]
```

`--filter=[origin/main]` runs only what the branch actually affected. CI uses it on every pull request.

**Typecheck only what changed.**

Turborepo caches `typecheck` per package against its declared inputs, so an untouched package is never rechecked.

**Source exports in development.**

No intermediate build step between editing a package and seeing it in the app.

**Parallelism from layering.**

Independent packages build simultaneously. The layer model is a performance feature as much as an architectural one.

---

# Security Considerations

**Dependency isolation.**

The renderer's dependency allowlist limits the third-party code executing on a page that handles payments. Every addition to that list is a security review, not a preference.

**Supply chain.**

```
Lockfile committed and required in CI
Exact versions pinned for direct dependencies
pnpm audit in CI, blocking on high and critical
New dependencies require justification in the pull request
Provenance verified where publishers support it
```

Per [security.md](./security.md).

**Secrets never enter packages.**

Packages receive configuration through function parameters. Only apps read environment variables, and only through a validated schema.

```ts
// packages — correct
export function createStripeService(config: StripeConfig) { … }

// packages — forbidden
const key = process.env.STRIPE_SECRET_KEY
```

This makes it structurally impossible for a library imported by the client bundle to reference a server secret.

**Server-only enforcement.**

`@checkout-studio/database` and the server portions of `@checkout-studio/api` carry `import "server-only"` at their entry points. Importing them into a client component is a build error, not a runtime leak.

**Plugin permissions.**

Plugins declare permissions in their manifest and receive a capability-scoped `PluginApi`. A plugin cannot import `@checkout-studio/database`; the boundary lint forbids it and the runtime does not expose it.

---

# Testing Structure

```
Unit + component     colocated,  <name>.test.ts
Integration          packages/<pkg>/tests/integration/
E2E                  apps/studio/e2e/,  apps/renderer/e2e/
Fixtures             packages/schema/fixtures/   shared schemas
Visual regression    apps/studio/e2e/visual/
```

Shared schema fixtures live in `packages/schema/fixtures/` so the editor, renderer, importer, and migration tests all validate against the same documents. Divergent fixtures are how two subsystems come to disagree about what a valid schema is.

Coverage targets are defined in [testing.md](./testing.md); `schema`, `renderer`, and the payment services in `api` require 100%.

---

# Future Expansion

The structure is designed to absorb the following without reorganization.

**Additional products.**

```
apps/landing-studio/      Landing page builder
apps/funnel-studio/       Funnel builder
apps/form-studio/         Form builder
```

Each reuses `editor`, `renderer`, `schema`, `plugin-sdk`, `ui`, and `design-system` unchanged, adding only its own plugins. This is the point of the whole layout: the engine packages are product-agnostic, and a new product is a new app plus a plugin set.

**Published SDK.**

`@checkout-studio/renderer`, `@checkout-studio/schema`, and `@checkout-studio/plugin-sdk` are the natural public packages. They are already dependency-light and app-independent, so publishing is a versioning decision rather than an extraction project.

**Third-party plugins.**

An external plugin is a package implementing `plugin-sdk` contracts. The registry already resolves by manifest rather than by import path, so a marketplace requires distribution and sandboxing, not engine changes.

**Alternative renderers.**

`packages/renderer-native/` for React Native, or `packages/renderer-email/` for email output. Both consume the same schema; only the component registry differs.

**Edge runtime.**

`apps/renderer` is already free of Node-specific dependencies in its render path, which is what makes an edge deployment a configuration change.

**Internationalization.**

`packages/i18n/` at Layer 1, with locale files colocated in each plugin.

---

# Success Criteria

The structure is successful when:

- The renderer builds and ships without a single byte of editor code.
- A layer violation fails CI within two minutes of being pushed.
- A new engineer can locate the right home for a change without asking.
- A warm build completes in under 30 seconds.
- The dependency graph has zero cycles and remains readable as an image.
- Every package's responsibility fits in one sentence.
- Adding a second product requires a new app and new plugins, and zero changes to the engine packages.
- No package reads an environment variable.
- The published checkout bundle stays under 150 KB without anyone actively defending it.

---

# Philosophy

Architecture is not what a diagram says. It is what the import statements permit.

A document can assert that the renderer is independent of the editor, but only a build that fails when someone imports one from the other makes it true. Every boundary in this repository is therefore expressed twice: once as an idea in [architecture.md](./architecture.md), and once as a rule the machine enforces.

The layering is what makes VisualEngine — the generic editing platform underneath Checkout Studio — real rather than aspirational. When the second product ships, it will not be because someone refactored. It will be because the folders were already right.

Structure is the cheapest form of discipline.

Get it right at the start and it costs nothing forever.
