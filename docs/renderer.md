# Checkout Studio Renderer Specification

**Version:** 1.0

**Status:** Core Rendering Engine

---

# Overview

The Renderer is responsible for converting a published checkout schema into a fully interactive checkout experience.

The renderer is completely independent from the editor.

It should never import editor-specific code.

The renderer is designed to be:

- Lightweight
- Fast
- Tree-shakeable
- SSR Compatible
- Extensible
- Plugin Driven

---

# Responsibilities

The renderer is responsible for:

- Rendering JSON schema
- Resolving components
- Rendering responsive layouts
- Applying themes
- Loading plugins
- Executing visibility rules
- Binding form state
- Rendering checkout components
- Handling client hydration

It is NOT responsible for:

- Editing
- Selection
- History
- Drag & Drop
- Property Inspector
- Undo / Redo

---

# Architecture

```
JSON Schema

↓

Renderer

↓

Component Registry

↓

Component

↓

React Element

↓

DOM
```

---

# Rendering Flow

```
Load Schema

↓

Validate Schema

↓

Load Theme

↓

Load Plugins

↓

Resolve Components

↓

Apply Styles

↓

Render Tree

↓

Hydrate Client Features
```

---

# Packages

```
packages/

renderer/

runtime/

registry/

components/

hooks/

providers/

styles/

utils/

types/
```

---

# Entry Point

```tsx
<CheckoutRenderer schema={schema} theme={theme} registry={registry} mode="published" />
```

`schema` and `theme` are serializable data.

`registry` is a populated plugin-sdk registry built by the application at startup. The renderer never loads, imports, or registers plugins itself.

---

# Input

Renderer Input

```ts
interface RendererProps {
  schema: CheckoutSchema
  /** Resolved theme: the project theme plus page overrides, or a revision's snapshot. */
  theme: Theme
  registry: RendererRegistry
  mode: "editor-preview" | "published" | "static" | "embed"
  /** Asset reference → URL resolution. */
  resolveAsset: (assetId: string) => AssetUrls
}
```

---

# Output

Produces

React Elements

or

HTML

depending on runtime.

---

# Rendering Pipeline

Step 1

Validate Schema

↓

Step 2

Initialize Context

↓

Step 3

Load Plugins

↓

Step 4

Resolve Component Types

↓

Step 5

Render Children

↓

Step 6

Apply Responsive Styles

↓

Step 7

Hydrate Interactive Components

---

# Component Registry

Every component registers itself.

Example

```ts
registry.register({
  type: "core.button",
  component: Button,
})
```

Renderer never imports individual components directly.

Everything comes through the registry.

---

# Plugin Registry

Plugins register:

- Components
- Hooks
- Validators
- Actions

Example

```
Checkout Plugin

↓

Registers

↓

Stripe Element
Order Summary
Coupon
Trust Badge
```

---

# Recursive Rendering

Every node renders its children recursively.

```
Section

↓

Container

↓

Grid

↓

Card

↓

Button
```

No depth limit.

---

# Component Resolution

Renderer resolves components by type.

Example

```
core.section

↓

Section Component
```

```
checkout.order-summary

↓

OrderSummary Component
```

Unknown components

↓

Gracefully fallback.

---

# Fallback Component

Unknown component types resolve to

```
core.unsupported
```

which renders a placeholder in the editor and renders nothing in a published checkout, instead of crashing.

The original node data is preserved, so the node recovers automatically once the missing plugin is installed.

Fallback behavior per runtime mode is defined in [error-handling.md](./error-handling.md).

---

# Styling

Styles are resolved in six stages, defined in [theme-system.md](./theme-system.md):

Theme Defaults

↓

Component Defaults

↓

Node Base Styles

↓

Responsive Overrides

↓

State Overrides (hover, focus, active, disabled)

↓

Visibility & Conditions

---

# Theme System

Style resolution order and CSS variable generation are defined in [theme-system.md](./theme-system.md).

Supports

Colors

Typography

Spacing

Radius

Shadows

Animations

CSS Variables generated once.

---

# Responsive Rendering

Supports

Desktop

Tablet

Mobile

How the breakpoint is chosen depends on the mode.

**Published, static, and embed modes** render every breakpoint at once. The server cannot know the visitor's viewport, so tablet and mobile overrides are emitted as media-query CSS, and breakpoint-only visibility ("Desktop only", "Mobile only") is expressed as CSS `display` rules rather than by omitting nodes. The HTML is identical at every width. That is what prevents both wrong-first-paint and hydration mismatches, and it protects the CLS budget.

**Editor-preview mode** renders only the breakpoint the user is editing. The canvas knows its device frame, and resolving one breakpoint keeps interaction within the 16ms frame budget.

Visibility rules that can be decided on the server (manual hidden, country, coupon present) skip the node entirely. Rules that depend on client state (a form field's value) render the node and toggle it on the client.

---

# Visibility Rules

Nodes may define

Visible

Hidden

Conditional

Renderer evaluates rules before rendering.

Hidden nodes are skipped.

---

# Conditional Rendering

Example

```
Shipping Country == US

↓

Show State Field
```

Rules execute before rendering.

---

# Forms

The forms plugin (`plugins/core-forms`) contributes a form provider through Plugin Providers.

That provider creates the React Hook Form context. Input components connect to it.

The renderer itself contains no form logic, consistent with CLAUDE.md's plugin-first rule.

---

# Validation

Validation comes from the schema.

The forms plugin generates the Zod schema dynamically from the rules its components declare.

---

# Checkout Context

Checkout components receive

Cart

Customer

Discounts

Shipping

Taxes

Currency

through a provider contributed by the checkout plugin (`plugins/checkout`), never by the renderer.

The renderer knows nothing about carts or payments. That is what allows a second product to reuse it unchanged.

---

# Context Providers

Renderer initializes

Theme Provider

↓

Variable Provider (resolves `$var` bindings from plugin-supplied sources)

↓

Plugin Providers (for example: checkout, forms — each contributed by its plugin)

↓

Render Tree

Plugin providers are ordered by their declared dependencies. The forms provider wraps the checkout provider, because checkout fields are form fields.

---

# Lazy Components

Heavy components load dynamically.

Examples

- Stripe
- Maps
- Video
- Charts

---

# Error Boundaries

Every plugin renders inside an Error Boundary.

One broken component must never crash the page.

---

# SSR

Renderer supports

Server rendering

Streaming

Static Generation

Hydration

The server/client split is explicit.

```
Published, static, embed
   Tree walker ........... React Server Component
   Static components ..... render on the server, ship no JavaScript
   Interactive components  'use client' leaves, hydrated individually
   Providers ............. client components wrapping only the
                           subtrees that need them

Editor preview
   Everything ............ client-side — the canvas is an interactive app
```

Each component definition declares `interactive: boolean`. Only interactive components ship JavaScript to published pages, which is how "hydrate only interactive components" is achieved.

The registry must be populated identically in the server module graph and the client module graph. Each application builds it in one module that both graphs import; plugins' renderer entry points are safe to import in either environment.

---

# Static Rendering

Renderer can generate

Static HTML

for maximum performance.

---

# Embed Mode

Renderer supports

```html
<script src="https://checkout.example.com/embed.js" data-checkout-id="abc123"></script>
```

`embed.js` does one thing: it inserts a sandboxed `<iframe>` pointing at the `embed/[id]` route on `apps/renderer`, and resizes it to fit its content.

The checkout always renders inside that iframe, on a page we host. It never renders directly into the merchant's page.

This is what makes embedding safe:

- The merchant's scripts and styles cannot read or alter the checkout.
- Our CSP governs the page that contains the payment form, preserving the script policy in [security.md](./security.md).
- Checkout API calls stay same-origin.

The iframe carries `allow="payment"` so wallets can work. Apple Pay additionally requires the merchant's host domain to be registered as a payment method domain on their connected account; embed setup collects and registers it, per [stripe-integration.md](./stripe-integration.md).

The merchant's host page remains in the merchant's own PCI scope, since a script there could overlay the iframe. Embed setup states this.

---

# Runtime Modes

Editor Preview

Published Checkout

Embed

Static Export

SSR

---

# Component Lifecycle

Initialize

↓

Validate

↓

Render

↓

Hydrate

↓

Destroy

---

# Rendering Rules

Never mutate schema.

Never modify props.

Renderer is pure.

Same input

↓

Same output.

---

# Performance

Renderer should support

2000+

nodes

without noticeable slowdown.

---

# Memoization

Memoize

Component Resolution

Theme

Style Computation

Registry Lookups

Avoid unnecessary re-renders.

---

# Accessibility

Generated HTML must include

ARIA

Labels

Roles

Keyboard Navigation

Focus Management

---

# SEO

Support

SSR

Metadata

Structured Data

Semantic HTML

Canonical URLs

---

# Security

Renderer never executes

JavaScript

from schema.

Never allow

eval()

Function()

Inline scripts

---

# Custom Components

Developers can register custom components.

Example

```ts
registry.register({
  type: "custom.hero",
  component: HeroSection,
})
```

---

# Version Compatibility

Every schema includes

```json
{
  "version": "1.0.0"
}
```

Renderer supports schema migrations.

---

# Rendering Targets

Supported

- Next.js
- React
- Embedded Script
- Static HTML
- Future React Native Renderer

---

# Testing

Renderer must include

Unit Tests

Snapshot Tests

SSR Tests

Hydration Tests

Performance Tests

Accessibility Tests

---

# Design Principles

The renderer should be:

Pure

Deterministic

Stateless

Composable

Extensible

Framework Friendly

Plugin Driven

---

# Success Criteria

A published checkout should:

- Render in under 100ms after data is available.
- Support thousands of nodes.
- Hydrate only interactive components.
- Produce semantic HTML.
- Remain framework-agnostic except for the React implementation.
- Be reusable by any client (editor, embed, SSR, API).

---

# Renderer Philosophy

The renderer is the engine of Checkout Studio.

The editor creates schemas.

The renderer brings them to life.

Every feature, plugin, and template should ultimately pass through this single rendering pipeline.
