# Checkout Studio Architecture

**Version:** 1.0

**Status:** System Architecture

---

# Overview

Checkout Studio is a production-grade SaaS built using a modular architecture.

The application is divided into independent layers.

Each layer has one responsibility.

No layer should directly depend on another layer unless explicitly defined.

The architecture prioritizes:

- Scalability
- Performance
- Extensibility
- Maintainability
- Testability

---

# High-Level Architecture

```
                    Browser
                       │
                       ▼
             Next.js Application
                       │
      ┌────────────────────────────────┐
      │                                │
      ▼                                ▼
 Studio Editor                  Public Renderer
      │                                │
      └──────────────┬─────────────────┘
                     ▼
                JSON Schema
                     │
             Validation Layer
                     │
          Renderer Component Tree
                     │
              Stripe Integration
                     │
                 Payment API
                     │
                  PostgreSQL
```

---

# VisualEngine

Checkout Studio is the first product built on **VisualEngine**, a generic visual editing platform.

```
                        VisualEngine
              editor · schema · renderer · plugin-sdk
                              │
    ┌──────────┬──────────┬───┴────┬──────────┬──────────┐
    ▼          ▼          ▼        ▼          ▼          ▼
 Checkout   Landing    Funnel    Form      Survey     Email
  Studio     Pages     Builder  Builder   Builder    Builder
  (now)                            (future)
```

VisualEngine is not a separate repository or a separate product.

It is the name for the four engine packages that contain **no** checkout-specific knowledge:

```
packages/schema        how a document is represented
packages/editor        how a document is edited
packages/renderer      how a document is displayed
packages/plugin-sdk    how the platform is extended
```

Everything checkout-specific lives in plugins.

The architectural test is concrete:

> A second product should require a new app and a new plugin set,
> and zero changes to the four engine packages.

Every decision in this document exists to keep that statement true.

If a feature requires modifying `editor`, `renderer`, `schema`, or `plugin-sdk` to accommodate something checkout-specific, the design is wrong and the feature belongs in a plugin.

---

# Core Modules

The application consists of six major systems.

## Studio

Visual drag-and-drop editor.

Responsibilities:

- Canvas
- Selection
- Layers
- Inspector
- Undo / Redo
- History
- Responsive editing

Studio never renders production pages.

---

## Renderer

Responsible for displaying checkout pages.

Consumes only JSON schema.

Must not contain editor logic.

Must support:

- SSR
- SSG
- Embedded rendering
- Standalone rendering

---

## Schema Engine

Every checkout is stored as JSON.

The schema represents:

- Structure
- Components
- Styles
- Responsive overrides
- Visibility
- Validation
- Metadata

The schema is the source of truth.

---

## Component Registry

Every component registers itself.

Example:

```
Heading

Button

Image

Container

Payment Element

Coupon

Order Summary
```

The renderer never imports components directly.

Everything comes from the registry.

---

## Property System

Every component exposes editable properties.

Example:

```
Heading

Text

Font Size

Weight

Alignment

Color

Spacing

Visibility
```

The Inspector builds itself dynamically.

No hardcoded side panel.

---

## Plugin System

Checkout Studio supports plugins.

Plugins may register:

Components

Property inspectors

Toolbar buttons

Commands

Context menu items

Renderer mappings

Validation rules

Future expansion should require zero modifications to the editor core.

---

# Rendering Pipeline

```
User edits component

↓

State Store

↓

Schema Updated

↓

Validation

↓

Renderer Refresh

↓

Canvas Updates
```

Publishing:

```
Schema

↓

Optimization

↓

Compression

↓

Database

↓

Renderer

↓

Public Checkout
```

---

# State Management

Use Zustand.

State is normalized.

Never deeply nest objects.

```
Root

↓

Node Map

↓

Children References

↓

Styles

↓

Metadata
```

Benefits:

- Fast lookup
- Minimal re-rendering
- Easy undo
- Easy drag and drop

---

# History System

Every mutation creates a snapshot.

Undo:

50 states

Redo:

50 states

History uses structural sharing where possible.

---

# Responsive Engine

Three breakpoints.

Desktop

Tablet

Mobile

Styles cascade downward.

Desktop

↓

Tablet

↓

Mobile

Only overrides are stored.

---

# Component Tree

Everything is a node.

Example:

```
Page

Section

Container

Columns

Heading

Button

Payment
```

Every node has:

Unique ID

Parent ID

Children

Styles

Props

Metadata

Visibility

Animations

---

# Studio Layout

```
+------------------------------------------------------+

Toolbar

+------------+-------------------------+---------------+

Library | Canvas | Inspector

Layers | | Properties

Pages | | Styles

Assets | | Effects

+------------+-------------------------+---------------+
```

Panels are:

Resizable

Collapsible

Persistent

---

# Folder Structure

```
apps/
studio/                 Editor + dashboard
renderer/               Published checkouts
docs/                   Documentation site

packages/
config/                 Shared tooling configuration
types/                  Shared TypeScript types
utils/                  Pure utilities + error model
observability/          Logging, metrics, tracing, RUM
schema/                 Schema, validation, migration
design-system/          Tokens, themes, Tailwind preset
ui/                     Component library
hooks/                  Shared React hooks
database/               Prisma client + repositories
api/                    API contracts, handlers, services
plugin-sdk/             Plugin contracts + registries
editor/                 Visual editing engine
renderer/               Rendering engine

plugins/
core-layout/
core-content/
core-forms/
checkout/
marketing/
ai/

docs/

scripts/
```

Every package has one responsibility.

Avoid circular dependencies.

Plugins are a top-level workspace, not a shared package, because they are independently versioned extensions rather than shared code.

The layer model, dependency rules, and boundary enforcement are defined in [monorepo-structure.md](./monorepo-structure.md).

---

# API Layer

The frontend never talks directly to Stripe.

Flow:

Frontend

↓

Route Handler

↓

Service Layer

↓

Stripe SDK

↓

Response

---

# Database Layer

Prisma ORM.

PostgreSQL.

Entities:

Users

Projects

Pages

Revisions

Orders

Templates

Themes

Assets

Plugins

---

# Rendering Performance

Targets and budgets are defined in [performance.md](./performance.md).

Goals:

Render only visible nodes.

Virtualize long trees.

Lazy load heavy components.

Memoize component rendering.

Avoid unnecessary re-renders.

---

# Asset Management

Images

Fonts

Icons

Videos

Files

Uploaded assets receive optimized versions automatically.

---

# Autosave

Changes save automatically.

Debounce:

5 seconds

Maximum wait during continuous editing:

30 seconds

Immediate save on:

Publish

Close

Manual Save

---

# Security

Authentication:

Clerk

Authorization:

Role based

Payment secrets remain server-side.

Never expose secret keys.

The full security architecture is defined in [security.md](./security.md).

---

# Error Handling

Every module has boundaries.

Recover gracefully.

Never crash the editor.

Provide actionable error messages.

The error taxonomy, boundary hierarchy, and recovery strategies are defined in [error-handling.md](./error-handling.md).

---

# Testing Strategy

Unit Tests

Integration Tests

E2E Tests

Visual Regression Tests

Accessibility Tests

Performance Benchmarks

See [testing.md](./testing.md).

---

# Deployment

Frontend:

Vercel

Database:

PostgreSQL

Redis:

Upstash

Storage:

UploadThing

Payments:

Stripe

Monitoring:

Sentry

Analytics:

PostHog

Environments and the deployment pipeline are defined in [deployment.md](./deployment.md).

Telemetry, SLOs, and alerting are defined in [observability.md](./observability.md).

---

# Future Expansion

The architecture must support:

AI Page Generation

Marketplace

Realtime Collaboration

Version History

Plugins

Extensions

Localization

White Label

without requiring architectural rewrites.

---

# Engineering Rules

Never place business logic inside UI components.

Never directly mutate state.

Never duplicate component definitions.

Never couple the renderer to the editor.

Never hardcode component behavior.

Everything should remain modular, testable and extensible.

---

# Architecture Principle

The editor creates.

The schema describes.

The renderer displays.

The server processes.

Each layer has one responsibility.

That separation is the foundation of Checkout Studio.
