# Checkout Studio Documentation

**Version:** 1.0

**Status:** Documentation Index & Entry Point

---

# Start Here

This directory contains the complete engineering blueprint for Checkout Studio.

It is written so that a senior engineer joining the project can understand the entire system, locate any decision, and implement any feature without needing to ask what was intended.

Thirty-two specifications, one index.

If you read nothing else, read [product-spec.md](./product-spec.md), then [architecture.md](./architecture.md), then [schema.md](./schema.md). Those three explain what we are building, how it is structured, and what holds it together.

---

# Project Overview

Checkout Studio is a premium drag-and-drop checkout builder that lets businesses design high-converting checkout experiences without writing code, with native Stripe integration.

It is also the first product built on **VisualEngine** — a generic visual editing platform intended to power a family of products.

```
                        VisualEngine
              (editor · schema · renderer · plugins)
                              │
    ┌──────────┬──────────┬───┴────┬──────────┬──────────┐
    ▼          ▼          ▼        ▼          ▼          ▼
 Checkout   Landing    Funnel    Form      Survey     Email
  Studio     Pages     Builder  Builder   Builder    Builder
  (now)                        (future)
```

The consequence of that ambition is the single most important constraint in this codebase:

> **The editor knows nothing about checkout.**
>
> Everything checkout-specific is a plugin.

A second product should require a new application and a new plugin set — and zero changes to the engine.

## The Four Layers

```
The editor creates.
The schema describes.
The renderer displays.
The server processes.
```

Every document in this directory is an elaboration of one of those four sentences.

## The Central Contract

```
┌──────────┐        ┌──────────┐        ┌──────────┐
│  EDITOR  │───────▶│  SCHEMA  │───────▶│ RENDERER │
│          │        │  (JSON)  │        │          │
└──────────┘        └──────────┘        └──────────┘
     ▲                    │                    │
     │                    ▼                    ▼
     └──────────── Database              Published
                                          Checkout
```

The editor and the renderer never import each other. They share exactly one thing: the schema.

That separation is not a preference. It is what makes the renderer fast, the editor replaceable, and the platform extensible.

---

# Reading Order

## For Everyone — The Core Five

Read these in order. They take about two hours and they explain the whole system.

```
1. product-spec.md          What we are building and for whom
2. architecture.md          How the system is structured
3. schema.md                The source of truth for every checkout
4. monorepo-structure.md    Where code lives and what may import what
5. coding-standards.md      How we write code here
```

## By Role

### Frontend / Editor Engineer

```
Core Five
   ↓
state-management.md      the editor's brain
editor-behavior.md       how every interaction must feel
ui-guidelines.md         layout, panels, micro-interactions
design-system.md         the visual language
theme-system.md          tokens, both Studio and Checkout
component-library.md     every component and its properties
keyboard-shortcuts.md    the command model
plugin-api.md            how components register themselves
```

### Renderer Engineer

```
Core Five
   ↓
renderer.md              the rendering engine
theme-system.md          style resolution and CSS variables
plugin-api.md            component registration
performance.md           the budgets you must not exceed
error-handling.md        graceful degradation rules
```

### Backend Engineer

```
Core Five
   ↓
database.md              entities and relationships
api-spec.md              endpoints and contracts
security.md              authentication, authorization, payments
stripe-integration.md    payments, webhooks, orders
pricing-billing.md       plans, entitlements, subscriptions
history-versioning.md    revisions and publishing
error-handling.md        the error taxonomy
observability.md         logging, metrics, tracing
```

### Platform / Infrastructure Engineer

```
Core Five
   ↓
deployment.md            environments and infrastructure
release-process.md       how changes reach production
observability.md         monitoring, SLOs, alerting
security.md              the security architecture
testing.md               the quality gates
performance.md           the budgets CI enforces
```

### Product / Design

```
product-spec.md
design-system.md
ui-guidelines.md
editor-behavior.md
component-library.md
template-system.md
theme-system.md
roadmap.md
```

## New Engineer, Week One

```
Day 1   The Core Five. Set up locally. Run everything.
        → contributing.md, "Getting Started"

Day 2   Read the specification for your area.
        Trace one flow end to end in the docs:
        a user drags a Button → schema → publish → renders.

Day 3   Ship something small. Full pipeline: branch, test, PR, review.
        → contributing.md, "Onboarding week one"

Day 4   Review someone else's pull request.

Day 5   Take a real issue.
```

---

# The Documentation Map

Twenty-nine documents, grouped by what they answer.

## Foundation — What and Why

| Document                                         | Answers                                         |
| ------------------------------------------------ | ----------------------------------------------- |
| [product-spec.md](./product-spec.md)             | What are we building, for whom, and why         |
| [architecture.md](./architecture.md)             | How is the system structured                    |
| [roadmap.md](./roadmap.md)                       | In what order are we building it                |
| [phases.md](./phases.md)                         | How do I execute one phase, and when is it done |
| [monorepo-structure.md](./monorepo-structure.md) | Where does code live, and what may import what  |

## Core Engine — The Platform

| Document                                         | Answers                                   |
| ------------------------------------------------ | ----------------------------------------- |
| [schema.md](./schema.md)                         | How is a checkout represented             |
| [renderer.md](./renderer.md)                     | How does a schema become a page           |
| [state-management.md](./state-management.md)     | How does the editor hold and mutate state |
| [plugin-api.md](./plugin-api.md)                 | How is the platform extended              |
| [history-versioning.md](./history-versioning.md) | How is nothing ever lost                  |

## Editor Experience — How It Feels

| Document                                         | Answers                                      |
| ------------------------------------------------ | -------------------------------------------- |
| [editor-behavior.md](./editor-behavior.md)       | How does every interaction behave            |
| [ui-guidelines.md](./ui-guidelines.md)           | How is the interface laid out                |
| [keyboard-shortcuts.md](./keyboard-shortcuts.md) | How do expert users work                     |
| [design-system.md](./design-system.md)           | What is the visual language                  |
| [theme-system.md](./theme-system.md)             | How are design decisions expressed as tokens |
| [component-library.md](./component-library.md)   | What can users build with                    |
| [template-system.md](./template-system.md)       | How do users start faster                    |

## Backend & Data

| Document                                         | Answers                              |
| ------------------------------------------------ | ------------------------------------ |
| [database.md](./database.md)                     | What is stored and how is it related |
| [api-spec.md](./api-spec.md)                     | What are the API contracts           |
| [security.md](./security.md)                     | How is everything protected          |
| [stripe-integration.md](./stripe-integration.md) | How do our users take payments       |
| [export-import.md](./export-import.md)           | How does work move in and out        |

## Commercial

| Document                                   | Answers                            |
| ------------------------------------------ | ---------------------------------- |
| [pricing-billing.md](./pricing-billing.md) | How do we charge our own customers |

## Quality & Operations

| Document                                   | Answers                         |
| ------------------------------------------ | ------------------------------- |
| [testing.md](./testing.md)                 | How do we know it works         |
| [performance.md](./performance.md)         | How fast must it be             |
| [error-handling.md](./error-handling.md)   | What happens when it breaks     |
| [observability.md](./observability.md)     | How do we see what is happening |
| [deployment.md](./deployment.md)           | Where and how does it run       |
| [release-process.md](./release-process.md) | How do changes reach production |

## Process

| Document                                     | Answers                          |
| -------------------------------------------- | -------------------------------- |
| [coding-standards.md](./coding-standards.md) | How do we write code             |
| [contributing.md](./contributing.md)         | How does work enter the codebase |

## Future

| Document                             | Answers                                   |
| ------------------------------------ | ----------------------------------------- |
| [ai-assistant.md](./ai-assistant.md) | How will AI assist without taking control |

---

# Document Dependency Graph

Which documents depend on which. An arrow means "you should read the target first."

```
                        product-spec
                             │
                             ▼
                        architecture ◀──────── monorepo-structure
                             │
        ┌────────────┬───────┴───────┬────────────────┐
        ▼            ▼               ▼                ▼
     schema     plugin-api      design-system     database
        │            │               │                │
   ┌────┼────┬───────┼────┐          │                │
   ▼    ▼    ▼       ▼    ▼          ▼                ▼
render state comp-  temp- export  theme-sys       api-spec
  er   -mgmt  lib   late  import      │                │
   │     │      │      │              ▼                ▼
   │     │      │      │        ui-guidelines      security
   │     │      │      │              │                │
   │     ▼      │      │              ▼                │
   │  editor-behavior ─┴──────▶ keyboard-shortcuts     │
   │     │                             │                │
   │     └──────────┬──────────────────┘                │
   │                ▼                                   │
   │        history-versioning                          │
   │                │                                   │
   └────────┬───────┴───────────────┬───────────────────┘
            ▼                       ▼
     error-handling            performance
            │                       │
            └───────────┬───────────┘
                        ▼
                  observability
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
        testing    deployment   release-process
            │           │           │
            └───────────┼───────────┘
                        ▼
            coding-standards → contributing

                  ai-assistant
            (depends on schema + plugin-api,
             required by nothing)
```

Reading upward from any document gives you its prerequisites.

---

# Architecture Map

## System

```
                          Browser
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
        apps/studio                 apps/renderer
        (editor + dashboard)        (published checkouts)
                │                         │
                │                         │
    ┌───────────┼──────────┐              │
    ▼           ▼          ▼              ▼
 editor        ui        api          renderer
    │           │          │              │
    └─────┬─────┴────┬─────┴──────┬───────┘
          ▼          ▼            ▼
      plugin-sdk  database    design-system
          │          │            │
          └─────┬────┴────────────┘
                ▼
      schema · types · utils · observability
                │
                ▼
       PostgreSQL · Redis · Stripe · Clerk · UploadThing
```

## Data Flow — Editing

```
User drags a Button onto the canvas
        ↓
Command dispatched                          keyboard-shortcuts.md
        ↓
Editor action                               editor-behavior.md
        ↓
Zustand store, normalized node map          state-management.md
        ↓
Schema updated                              schema.md
        ↓
Validation                                  schema.md
        ↓
History entry                               history-versioning.md
        ↓
Selector-based re-render (one node only)    performance.md
        ↓
Canvas updates                              renderer.md (preview mode)
        ↓
Autosave after 5s                           history-versioning.md
```

## Data Flow — Publishing

```
User publishes
        ↓
Validate schema                             schema.md
        ↓
Snapshot theme into the revision            theme-system.md
        ↓
Create immutable revision                   history-versioning.md
        ↓
Update publishedRevisionId                  database.md
        ↓
Invalidate CDN cache                        deployment.md
        ↓
Renderer serves the published revision      renderer.md
        ↓
Customer completes checkout                 security.md
        ↓
Stripe webhook verified → Order created     api-spec.md
```

## Data Flow — Rendering

```
Request for a published checkout
        ↓
Load published revision                     database.md
        ↓
Migrate schema if needed                    schema.md
        ↓
Validate                                    schema.md
        ↓
Compile theme → CSS variables               theme-system.md
        ↓
Resolve components from the registry        plugin-api.md
        ↓
Evaluate visibility rules                   schema.md
        ↓
Render tree (SSR)                           renderer.md
        ↓
Hydrate interactive components only         performance.md
        ↓
Payment Element initializes                 security.md
```

---

# Folder Structure

Full detail in [monorepo-structure.md](./monorepo-structure.md).

```
checkout-studio/
│
├── apps/
│   ├── studio/                 Next.js — editor + dashboard
│   ├── renderer/               Next.js — published checkouts
│   └── docs/                   Documentation site (Phase 21)
│
├── packages/
│   ├── config/                 Shared tooling configuration
│   ├── types/                  Shared TypeScript types
│   ├── utils/                  Pure utilities + error model
│   ├── observability/          Logging, metrics, tracing, RUM
│   ├── schema/                 Schema, validation, migration
│   ├── design-system/          Tokens, themes, Tailwind preset
│   ├── ui/                     Component library
│   ├── hooks/                  Shared React hooks
│   ├── database/               Prisma schema, client, repositories
│   ├── api/                    API contracts, handlers, services
│   ├── plugin-sdk/             Plugin contracts + registries
│   ├── editor/                 Visual editing engine
│   └── renderer/               Rendering engine
│
├── plugins/
│   ├── core-layout/            Section, Container, Grid, Stack…
│   ├── core-content/           Heading, Text, Image, Button…
│   ├── core-forms/             Input, Select, Address…
│   ├── core-embed/             HTML Block, Code Block, Embed, Lottie
│   ├── checkout/               Payment Element, Order Summary…
│   ├── marketing/              FAQ, Countdown, Testimonials…
│   └── ai/                     AI assistant surfaces
│
├── docs/                       These specifications
└── scripts/                    Repository tooling
```

## Layer Rules

```
apps      → may depend on packages and plugins
packages  → may depend on strictly lower-layer packages only
plugins   → may depend on packages only

Nothing may depend on an app.
The renderer may never depend on the editor.
The editor may depend on the renderer — the canvas renders through it.
```

Both rules are enforced by ESLint boundaries and dependency-cruiser in CI, not by convention.

---

# Core Packages

| Package                          | Responsibility                                 | Depends on                                            |
| -------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `@checkout-studio/config`        | ESLint, TypeScript, Tailwind, Prettier presets | —                                                     |
| `@checkout-studio/types`         | Shared types, zero runtime                     | —                                                     |
| `@checkout-studio/utils`         | Pure utilities, error model                    | —                                                     |
| `@checkout-studio/observability` | Logging, metrics, tracing, RUM                 | types, utils                                          |
| `@checkout-studio/schema`        | Schema, validation, migration, tree operations | types, utils                                          |
| `@checkout-studio/design-system` | Design tokens, themes, Tailwind preset         | —                                                     |
| `@checkout-studio/ui`            | Studio component library                       | design-system, utils, observability                   |
| `@checkout-studio/hooks`         | Generic React hooks                            | utils                                                 |
| `@checkout-studio/database`      | Prisma client, repositories                    | types, schema                                         |
| `@checkout-studio/api`           | Contracts, handlers, services                  | database, renderer, plugin-sdk, schema, observability |
| `@checkout-studio/plugin-sdk`    | Plugin contracts and registries                | schema, types                                         |
| `@checkout-studio/editor`        | Visual editing engine                          | renderer, plugin-sdk, schema, ui, hooks               |
| `@checkout-studio/renderer`      | Rendering engine                               | plugin-sdk, schema, utils, observability              |

The dependency between the two engine packages is one-way: the editor renders its canvas through the renderer, and the renderer never imports the editor. That is what lets the published checkout ship without a byte of editor code while the canvas stays pixel-identical to it.

---

# Implementation Phases

Strategic order: [roadmap.md](./roadmap.md).

**Execution plan: [phases.md](./phases.md)** — per-phase scope, implementation steps, required tests, and exit criteria. This is the document to work from.

Each phase must be production-ready, typed, tested, documented, and committed before the next begins.

```
Phase 0    Product & Architecture Planning        ← these documents
Phase 1    Repository Foundation                  Turborepo, pnpm, Next.js, TS
Phase 2    Infrastructure                         Postgres, Prisma, Clerk, Redis
Phase 3    Design System                          tokens + component library
Phase 4    Studio Shell                           toolbar, panels, canvas frame
Phase 5    Editor State Engine                    Zustand, history, selection
Phase 6    Renderer Engine                        JSON → React, SSR, registry
Phase 7    Visual Canvas                          zoom, pan, guides, grid
Phase 8    Drag & Drop Engine                     dnd-kit, nesting, indicators
Phase 9    Core Component Library                 layout + content components
Phase 10   Form System                            RHF + Zod, conditional logic
Phase 11   Checkout Components                    payment, summary, coupon…
Phase 12   Property Inspector                     dynamic panels
Phase 13   Stripe Integration                     intents, webhooks, orders
Phase 14   Asset Management                       upload, library, optimization
Phase 15   Templates                              library, install, export
Phase 16   Publishing                             preview, publish, versions
Phase 17   AI Assistant                           generation and suggestions
Phase 18   Analytics                              dashboard and events
Phase 19   Performance Optimization               virtualization, splitting
Phase 20   Testing                                full suite across the platform
Phase 21   Production Release                     audit, CI/CD, monitoring
Phase 22   Enterprise Features                    orgs, roles, audit, API
Phase 23   Marketplace                            plugins, templates, themes
Phase 24   Collaboration                          realtime, presence, comments
Phase 25   Version 1.0 Launch
```

## Which Documents Govern Which Phase

```
Phase 1     monorepo-structure · coding-standards · contributing
Phase 2     database · security · error-handling · observability
Phase 3     design-system · theme-system · ui-guidelines
Phase 4–5   editor-behavior · state-management · ui-guidelines · keyboard-shortcuts
Phase 6     renderer · schema · plugin-api · theme-system
Phase 7–8   editor-behavior · ui-guidelines · keyboard-shortcuts · performance
Phase 9–12  component-library · plugin-api · theme-system
Phase 13    stripe-integration · security · api-spec · error-handling
Phase 14    database · api-spec · performance
Phase 15    template-system · export-import
Phase 16    history-versioning · deployment · release-process
Phase 17    ai-assistant · schema
Phase 18    observability
Phase 19    performance
Phase 20    testing
Phase 21    security · deployment · release-process · observability
Phase 22–24 plugin-api · database · state-management · history-versioning
Phase 25    pricing-billing · release-process
```

---

# Cross-Reference Index

Where a concept is defined, and where it is used.

| Concept            | Defined in                                       | Also relevant                                 |
| ------------------ | ------------------------------------------------ | --------------------------------------------- |
| Node               | [schema.md](./schema.md)                         | state-management, renderer, component-library |
| Schema version     | [schema.md](./schema.md)                         | export-import, release-process, renderer      |
| Component registry | [plugin-api.md](./plugin-api.md)                 | renderer, component-library                   |
| Command            | [keyboard-shortcuts.md](./keyboard-shortcuts.md) | plugin-api, editor-behavior                   |
| Design token       | [theme-system.md](./theme-system.md)             | design-system, ui-guidelines                  |
| Checkout Theme     | [theme-system.md](./theme-system.md)             | schema, renderer, template-system             |
| Studio Theme       | [theme-system.md](./theme-system.md)             | design-system, ui-guidelines                  |
| Revision           | [history-versioning.md](./history-versioning.md) | database, api-spec, release-process           |
| Publishing         | [history-versioning.md](./history-versioning.md) | api-spec, deployment, database                |
| Breakpoint         | [schema.md](./schema.md)                         | theme-system, editor-behavior, renderer       |
| Responsive cascade | [theme-system.md](./theme-system.md)             | schema, renderer, editor-behavior             |
| Style resolution   | [theme-system.md](./theme-system.md)             | renderer                                      |
| Bundle             | [export-import.md](./export-import.md)           | template-system                               |
| Template           | [template-system.md](./template-system.md)       | export-import, schema                         |
| Symbol             | [template-system.md](./template-system.md)       | schema, export-import                         |
| AppError           | [error-handling.md](./error-handling.md)         | api-spec, observability                       |
| Error code         | [error-handling.md](./error-handling.md)         | api-spec                                      |
| Correlation id     | [observability.md](./observability.md)           | error-handling, api-spec                      |
| SLO                | [observability.md](./observability.md)           | release-process                               |
| Feature flag       | [release-process.md](./release-process.md)       | deployment                                    |
| Expand / contract  | [release-process.md](./release-process.md)       | database, deployment                          |
| Layer boundary     | [monorepo-structure.md](./monorepo-structure.md) | architecture, contributing                    |
| Plugin manifest    | [plugin-api.md](./plugin-api.md)                 | export-import, release-process                |
| Permission model   | [security.md](./security.md)                     | plugin-api, database, api-spec                |
| Connected account  | [stripe-integration.md](./stripe-integration.md) | database, api-spec                            |
| PaymentIntent      | [stripe-integration.md](./stripe-integration.md) | error-handling, api-spec                      |
| Quote              | [stripe-integration.md](./stripe-integration.md) | component-library                             |
| Entitlements       | [pricing-billing.md](./pricing-billing.md)       | database, api-spec                            |
| Session lock       | [history-versioning.md](./history-versioning.md) | error-handling, state-management              |
| Performance budget | [performance.md](./performance.md)               | monorepo-structure, release-process           |
| Definition of Done | [testing.md](./testing.md)                       | contributing, phases                          |
| Exit Criteria      | [phases.md](./phases.md)                         | testing, contributing                         |
| Phase gate         | [phases.md](./phases.md)                         | roadmap, contributing                         |

---

# Key Decisions

Decisions already made. Changing any of them requires an RFC, per [contributing.md](./contributing.md).

| Decision               | Choice                    | Why                                                  |
| ---------------------- | ------------------------- | ---------------------------------------------------- |
| Framework              | Next.js App Router        | SSR, streaming, route handlers, Vercel               |
| Language               | TypeScript, strict        | Correctness at scale                                 |
| Monorepo               | Turborepo + pnpm          | Caching, boundaries, workspace linking               |
| Editor state           | Zustand + Immer           | Fine-grained subscriptions, minimal re-renders       |
| Drag & drop            | dnd-kit                   | Accessible, keyboard-capable, composable             |
| Forms                  | React Hook Form + Zod     | Uncontrolled performance, shared schemas             |
| Styling                | Tailwind + design tokens  | Consistency, no stylesheet sprawl                    |
| UI base                | shadcn/ui                 | Owned code, not a dependency                         |
| Icons                  | Lucide, only              | One visual language                                  |
| Animation              | Framer Motion             | Declarative, interruptible                           |
| ORM                    | Prisma                    | Type safety, migrations                              |
| Database               | PostgreSQL                | JSONB for schemas, relational for the rest           |
| Auth                   | Clerk                     | Never implement authentication                       |
| Payments (merchants)   | Stripe Connect Standard   | Direct charges; we never hold merchant keys or funds |
| Payments (our billing) | Stripe Billing + Checkout | We never build a card form                           |
| Cache                  | Upstash Redis             | Serverless-friendly                                  |
| Storage                | UploadThing               | Managed uploads and optimization                     |
| Testing                | Vitest, RTL, Playwright   | Speed, realism, accessibility support                |
| Errors                 | Sentry                    | Correlation with releases                            |
| Analytics              | PostHog                   | Product funnels and feature flags                    |
| Hosting                | Vercel                    | Edge, preview deploys, remote cache                  |

---

# Glossary

**Asset** — An uploaded file (image, video, font, SVG, PDF) referenced by nodes. Never embedded in a schema.

**Autosave** — Automatic persistence of the current draft, debounced to 5 seconds. Never creates a revision.

**Boundary** — An error boundary containing a failure to the narrowest possible scope. Also, a layer rule preventing forbidden imports.

**Breakpoint** — One of `desktop` (1440px), `tablet` (768px), `mobile` (390px). Styles cascade downward.

**Brand Kit** — A project-level identity (logo, colors, fonts) that seeds new themes and re-themes installed templates.

**Bundle** — A portable `.checkout.json` or `.checkout.zip` archive containing schema, theme, and assets.

**Canary** — A deployment stage serving a new release to a fraction of traffic while metrics are compared against the stable version.

**Checkout Theme** — The user-authored theme stored in a schema and applied to a rendered checkout. Distinct from the Studio Theme.

**Command** — The single unit of user intent. Shared by keyboard shortcuts, the command palette, toolbars, and context menus.

**Component** — A registered visual element with a definition, renderer, inspector, defaults, and validation rules.

**Component Registry** — The runtime map from a node `type` to its component definition. Populated by plugins.

**Correlation ID** — A per-request identifier tying together logs, traces, errors, and API responses.

**Connected Account** — A merchant's own Stripe account, authorized to us via Connect OAuth. We store its id, never its keys.

**Direct Charge** — A charge created on a merchant's connected account. Funds settle to them; we never custody money.

**Checkout Session** — One customer's attempt at one checkout, issued by the server on the first quote. Links quotes, the PaymentIntent, and any coupon hold.

**Coupon** — A merchant-defined discount stored in Checkout Studio. Redemptions are held at payment-intent creation and finalized by webhook.

**Draft** — The current editable state of a page, stored on the page as `draftSchema` and `draftVersion`. Never public, never a revision.

**Entitlements** — The runtime limits and features a subscription grants. Computed on every request, never stored.

**Expand / Contract** — A migration discipline splitting a schema change across releases so old and new code can run simultaneously.

**Feature Flag** — A runtime toggle decoupling deployment from release.

**Idempotency Key** — A client-generated key ensuring a repeated request produces one effect, never two.

**Inspector** — The right-hand property panel, constructed dynamically from component registrations. Never hardcoded.

**Layer** — A tier in the package dependency stratification. Packages depend downward only.

**Migration** — Either a database schema change, or a pure transformation of a checkout document from one schema version to another.

**Node** — Any element in a checkout tree. Has an id, type, parent, children, props, styles, visibility, and metadata.

**Normalized State** — The editor's flat node map keyed by id, with children stored as id arrays rather than nested objects.

**Plugin** — A self-contained module registering components, renderers, inspectors, commands, validators, or shortcuts.

**Quote** — A server-computed, signed, short-lived price breakdown. The only source of a payment amount.

**Property (prop)** — A behavioral value on a node. Never a visual style.

**Published Revision** — The immutable revision a page currently serves publicly.

**Renderer** — The engine converting a schema into a rendered checkout. Independent of the editor.

**Revision** — An immutable snapshot of a page's schema and theme.

**Scope** — An activation context determining which keyboard shortcuts are live.

**Session Lock** — A short-lived claim on a page's editing session, preventing two writers before real-time collaboration exists.

**Schema** — The JSON document describing a complete checkout. The source of truth for everything.

**SLO** — Service Level Objective. A reliability target with an error budget.

**Soak** — A monitoring period on staging before a production promotion.

**Studio** — The editor application.

**Studio Theme** — The theme of the product interface itself. Never user-editable.

**Style** — A visual value on a node, stored per breakpoint, with only overrides persisted.

**Symbol** — A global reusable component. Editing it updates every instance.

**Template** — A reusable checkout, page, section, or component, distributed as a bundle.

**Token** — A named design value. Primitive, semantic, or component-scoped.

**Transaction** — An atomic multi-step editor mutation producing exactly one history entry.

**VisualEngine** — The generic visual editing platform underlying Checkout Studio and future products.

**Visibility Rule** — A condition determining whether a node renders (device, country, cart value, coupon…).

---

# Documentation Standards

Every document in this directory follows the same shape.

```
Title
Version, Status

Purpose               Why this document exists
Overview              The system in one page
Architecture          Diagrams and structure
Design Principles     The rules that govern decisions
Internal Structure    Folders, types, interfaces
Workflows             Concrete end-to-end sequences
Best Practices        What to do and what to avoid
Performance           Targets and techniques
Security              Where applicable
Future Expansion      What the design absorbs without a rewrite
Success Criteria      How we know it worked
Philosophy            Why it matters
```

Style rules

```
Short lines. Generous whitespace.
ASCII diagrams over prose descriptions of structure.
TypeScript interfaces over paragraphs describing shapes.
Tables for enumerable facts.
Relative markdown links between documents.
No placeholders. No TODOs. No incomplete sections.
```

## Keeping Documentation Current

Documentation is part of every change, not a phase after it.

```
Behavior described in /docs changed   → update that document in the same PR
New capability                        → document before merging
New package                           → README + monorepo-structure.md
Schema change                         → schema.md + migration table
API change                            → api-spec.md
New error code                        → error-handling.md catalog
New shortcut                          → keyboard-shortcuts.md
New telemetry event                   → observability.md namespace
Architectural decision                → RFC in docs/rfcs/
```

If the code and the documentation disagree, that is a defect — and the documentation is at least as likely to be right.

---

# Quick Answers

| Question                      | Document                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------- |
| How do I set up locally?      | [contributing.md](./contributing.md)                                             |
| Where does this code belong?  | [monorepo-structure.md](./monorepo-structure.md)                                 |
| What does a node look like?   | [schema.md](./schema.md)                                                         |
| How do I add a component?     | [plugin-api.md](./plugin-api.md), [component-library.md](./component-library.md) |
| How do I add an API endpoint? | [api-spec.md](./api-spec.md), [contributing.md](./contributing.md)               |
| Which color should I use?     | [theme-system.md](./theme-system.md), [design-system.md](./design-system.md)     |
| What shortcut is free?        | [keyboard-shortcuts.md](./keyboard-shortcuts.md)                                 |
| How do I report an error?     | [error-handling.md](./error-handling.md)                                         |
| What should I log?            | [observability.md](./observability.md)                                           |
| How fast must this be?        | [performance.md](./performance.md)                                               |
| What tests are required?      | [testing.md](./testing.md)                                                       |
| How do I ship it?             | [release-process.md](./release-process.md)                                       |
| Is this secure?               | [security.md](./security.md)                                                     |
| How do payments work?         | [stripe-integration.md](./stripe-integration.md)                                 |
| What does a plan include?     | [pricing-billing.md](./pricing-billing.md)                                       |
| Can two people edit one page? | [history-versioning.md](./history-versioning.md)                                 |
| What are we building next?    | [roadmap.md](./roadmap.md)                                                       |
| What exactly do I build now?  | [phases.md](./phases.md)                                                         |
| Is this phase done?           | [phases.md](./phases.md) — Exit Criteria                                         |

---

# Documentation Philosophy

Documentation written after the code describes what was built. Documentation written before it describes what should be built — and that difference is the entire value.

These specifications exist so that implementation is a matter of execution rather than invention. Every ambiguity resolved here is an argument that does not happen in a pull request, a rewrite that does not happen in month six, and an inconsistency that never reaches a user.

They are also a promise to whoever comes next. The engineer reading this in three years will not have access to the conversations, the whiteboards, or the reasoning that produced these decisions. They will have this directory. It should be enough.

Write it down.

Keep it true.
