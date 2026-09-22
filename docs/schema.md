# Checkout Studio Schema Specification

**Version:** 1.0

**Status:** Core Technical Specification

---

# Overview

Every checkout inside Checkout Studio is represented as a JSON document.

The JSON schema is the single source of truth.

Everything derives from the schema:

- Canvas
- Renderer
- History
- Publishing
- Preview
- Templates
- AI
- Export
- Import

No UI state should be stored inside the schema.

The schema describes only the checkout.

---

# Design Goals

The schema must be:

- Human readable
- Versioned
- Serializable
- Extensible
- Backward compatible
- Platform independent

The schema must never depend on React.

---

# Top Level Structure

```json
{
  "version": "1.0.0",
  "projectId": "...",
  "pageId": "...",
  "theme": { "themeId": "theme_x7d9", "overrides": {} },
  "settings": {},
  "variables": {},
  "root": "...",
  "nodes": {}
}
```

```ts
interface CheckoutSchema {
  version: string
  projectId: string
  pageId: string
  theme: ThemeReference
  settings: PageSettings
  variables: Record<string, VariableDefinition>
  root: string
  nodes: Record<string, Node>
}

interface ThemeReference {
  /** The project Theme this page uses. */
  themeId: string
  /** Sparse page-level token overrides. Usually empty. */
  overrides?: DeepPartial<CheckoutTheme>
}
```

The draft **references** a project theme; it never copies it. That is what lets one theme edit restyle every page in the project.

The published revision **snapshots** the resolved theme alongside the schema, so a later theme edit never changes a live page. See [history-versioning.md](./history-versioning.md).

---

# Schema Sections

Every schema contains:

Project Metadata

↓

Theme

↓

Global Settings

↓

Assets

↓

Variables

↓

Node Tree

↓

Responsive Overrides

↓

Metadata

---

# Schema Version

Every schema contains a version.

Example

```
1.0.0
```

Future migrations transform old versions into new versions.

The renderer should never need to support dozens of schema formats.

---

# Root Node

Every checkout has one root node.

Example

```
root

↓

section

↓

container

↓

columns

↓

button
```

Everything exists below the root.

---

# Nodes

Every visual element is a node.

Examples

Section

Container

Heading

Text

Button

Image

Payment

Coupon

Order Summary

Divider

Spacer

FAQ

Countdown

---

# Node Definition

Each node contains:

Unique ID

Type

Parent

Children

Properties

Styles

Visibility

Animations

Metadata

Validation rules are **not** stored on the node. They are declared once by the component definition and apply to every instance.

---

Example

```json
{
  "id": "heading_h82k",
  "type": "core.heading",
  "parentId": "section_x7d9",
  "children": [],
  "props": {},
  "styles": {},
  "visibility": { "hidden": false },
  "animations": [],
  "metadata": { "locked": false }
}
```

Component type ids always take the form `<namespace>.<kebab-name>`. The canonical catalog of type ids is in [component-library.md](./component-library.md).

---

# Node Types

Layout

Section

Container

Grid

Columns

Stack

Spacer

Divider

Typography

Heading

Text

Badge

Media

Image

Video

Icon

Checkout

Payment Element

Coupon

Product

Order Summary

Shipping

Taxes

Marketing

FAQ

Countdown

Testimonials

Logos

Trust Badges

Forms

Input

Checkbox

Radio

Select

Address

Phone

Email

---

# Properties

Properties define behavior.

Examples

Heading

Text

Level

Alignment

Button

Text

Link

Target

Variant

Product

SKU

Price

Quantity

Properties never contain visual styles.

---

# Styles

Visual appearance belongs here.

Supported groups:

Typography

Spacing

Layout

Sizing

Background

Borders

Radius

Shadow

Opacity

Transforms

Effects

Animations

Responsive Overrides

---

Example

```json
{
  "styles": {
    "desktop": { "base": {}, "hover": {} },
    "tablet": { "base": {} },
    "mobile": { "base": {} }
  }
}
```

```ts
type ResponsiveStyles = Partial<Record<Breakpoint, StateStyles>>

interface StateStyles {
  base?: StyleProperties
  hover?: StyleProperties
  focus?: StyleProperties
  active?: StyleProperties
  disabled?: StyleProperties
}
```

Breakpoints cascade downward (desktop → tablet → mobile). Within a breakpoint, a state inherits from `base`. Only overrides are stored.

---

# Responsive System

Desktop

↓

Tablet

↓

Mobile

Only overridden values are stored.

Example

Desktop

Font Size

48

Tablet

32

Mobile

24

The renderer cascades values automatically.

---

# Theme

Theme stores reusable design tokens.

Example

Typography

Colors

Radius

Buttons

Spacing

Shadows

Themes never store page structure.

Themes are project-level records. A page schema holds a `ThemeReference`, never a copy.

Token tiers, style resolution order, and CSS variable generation are defined in [theme-system.md](./theme-system.md).

---

# Global Settings

Examples

Currency

Language

SEO

Favicon

Analytics

Tracking Integrations

Custom CSS

These apply to the entire checkout.

Tracking integrations are declared as data, never as code.

```json
{
  "tracking": [
    { "provider": "google-analytics-4", "id": "G-XXXXXXX" },
    { "provider": "meta-pixel", "id": "1234567890" }
  ]
}
```

The renderer loads each integration from its provider's allowlisted origin.

The schema never contains executable JavaScript. See **Scripts on Checkout Pages** in [security.md](./security.md).

---

# Assets

Assets are referenced.

Never embedded.

Supported:

Images

Videos

SVG

Fonts

Icons

Lottie

Any prop that points at an asset uses the reference form:

```json
{ "src": { "$asset": "ast_9f2a" } }
```

The renderer resolves the reference to an optimized URL at render time. No schema ever contains a storage URL, so assets can be moved, re-optimized, or re-hosted without touching a single page.

The set of assets a page uses is derived by walking its nodes. It is never stored separately.

---

# Variables

Dynamic values.

Examples

Customer Name

Product Name

Price

Discount

Coupon

Order Total

Currency

Variables allow dynamic rendering.

```ts
interface VariableDefinition {
  /** e.g. "order.total", "customer.firstName" */
  source: string
  type: "string" | "number" | "currency" | "date" | "boolean"
  fallback?: string | number | boolean
}
```

A prop binds to a variable with the reference form:

```json
{ "text": { "$var": "customer.firstName" } }
```

Variable sources are supplied at render time by plugins through plugin-sdk (the checkout plugin supplies `order.*` and `customer.*`). The engine defines the binding mechanism, never the sources.

---

# Symbols

A symbol is a reusable subtree shared across pages.

Symbol definitions are **project-level** records, not part of any page schema. A page places a symbol with an instance node:

```json
{
  "id": "symbolinst_a1b2",
  "type": "core.symbol-instance",
  "parentId": "section_x7d9",
  "children": [],
  "props": { "symbolId": "sym_footer", "overrides": {} },
  "styles": {},
  "visibility": { "hidden": false },
  "animations": [],
  "metadata": { "locked": false }
}
```

The renderer expands an instance from its symbol definition at render time. Editing the symbol changes every instance. Detaching copies the symbol's subtree into the page and removes the instance.

Published revisions snapshot the symbol definitions they use, so editing a symbol never changes a live page.

See [template-system.md](./template-system.md).

---

# Visibility Rules

Every node supports conditions.

Examples

Hidden (manually hidden in the editor — not rendered anywhere)

Desktop only

Mobile only

Logged-in users

Country equals US

Coupon exists

Order value > $100

---

# Animations

Animation metadata.

Examples

Fade

Slide

Scale

Reveal

Duration

Delay

Trigger

Animation definitions remain independent from rendering.

---

# Validation

Components define validation. Plugins contribute every component-specific rule through plugin-sdk; the schema package only runs them.

Example

Heading (core)

Must not be empty.

Image (core)

Requires source.

Payment Element (checkout plugin)

Requires a Stripe connection.

The schema package validates structure and references itself. Component rules are injected as a validator registry, so the engine never contains product-specific logic.

---

# Metadata

Metadata is editor-only information.

Examples

Locked

Display Name

Notes

Tags

Created Date

Updated Date

Author

Metadata never affects rendering.

---

# Node Relationships

Every node contains:

Parent

Children

Sibling Order

The tree remains normalized.

---

# IDs

Every node ID is unique.

Examples

```
section_x7d9

heading_h82k

button_u128
```

IDs never change.

---

# Ordering

Children are stored in order.

Example

```
Section

↓

Heading

↓

Text

↓

Button
```

The renderer follows this order.

---

# Serialization

Schemas must serialize to JSON.

No functions.

No React components.

No DOM references.

No class instances.

---

# Import / Export

The schema supports:

Import

Export

Templates

Duplication

Version History

AI Generation

Bundle formats, the manifest, validation gates, and ID regeneration are defined in [export-import.md](./export-import.md).

---

# History

Undo / Redo stores schema snapshots.

History is immutable.

Snapshots reference schema versions.

---

# Publishing

Publishing freezes a schema revision.

Future edits create new revisions.

Published revisions remain immutable.

---

# Migration

Schema migrations are versioned.

Example

```
1.0.0

↓

1.1.0

↓

2.0.0
```

Automatic migration occurs before rendering.

---

# Renderer Contract

The renderer receives:

Schema

↓

Validation

↓

Component Registry

↓

Rendered Checkout

The renderer never modifies the schema.

---

# AI Contract

AI never generates React.

AI generates schema.

Example

Prompt

↓

AI

↓

Schema

↓

Renderer

↓

Checkout

This keeps AI platform-independent.

---

# Future Features

The schema must support future additions without breaking existing documents.

Examples

Localization

Collaboration

Comments

Version Diff

Conditional Logic

Experiments

Marketplace Components

Plugins

---

# Performance

The schema should remain compact.

Avoid duplication.

Reuse shared tokens.

Store only overrides.

Minimize payload size.

---

# Security

The schema never contains:

Stripe Secret Keys

Passwords

Private Credentials

Authentication Tokens

Sensitive data remains server-side.

---

# Schema Principles

The schema describes the checkout.

The renderer displays the checkout.

The editor edits the checkout.

The server processes the checkout.

Every system communicates through the schema.

The schema is the foundation of Checkout Studio.
