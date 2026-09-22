# Checkout Studio Plugin API

**Version:** 1.0

**Status:** Technical Specification

---

# Overview

Checkout Studio is built around a plugin-first architecture.

The editor itself contains only the minimum functionality required to:

- Render the canvas
- Manage state
- Handle selections
- Manage drag and drop
- Render the inspector
- Render toolbars
- Publish schemas

Everything else is provided through plugins.

This allows Checkout Studio to remain modular, maintainable, and future-proof.

---

# Plugin Philosophy

Plugins should extend the editor.

Plugins should never modify the editor.

Plugins communicate with the core through public APIs only.

No plugin should access private internals.

---

# Plugin Types

Checkout Studio supports multiple plugin categories.

## Component Plugin

Registers new visual components.

Examples:

- Heading
- Button
- Image
- Section
- Product Card
- Stripe Payment Element
- Coupon
- FAQ

---

## Renderer Plugin

Maps schema nodes to React components.

Example:

```
core.heading

↓

HeadingRenderer
```

Type ids always take the form `<namespace>.<kebab-name>`, per the catalog in [component-library.md](./component-library.md).

---

## Property Plugin

Registers inspector panels.

Example:

Button

↓

Typography

↓

Spacing

↓

Effects

↓

Interaction

---

## Toolbar Plugin

Adds actions to the toolbar.

Examples:

Duplicate

Group

Align

Distribute

Lock

Hide

---

## Context Menu Plugin

Adds right-click actions.

Example:

Duplicate

Delete

Wrap in Container

Convert to Stack

---

## Validation Plugin

Runs validation rules.

Examples:

Missing Payment Element

Multiple Submit Buttons

Missing Product

Empty Heading

---

## Command Plugin

Registers command palette actions.

Example:

⌘ K

↓

Insert Button

↓

Center Canvas

↓

Publish

↓

Install Plugin

---

## Event Plugin

Listens for editor events.

Example:

Node Selected

↓

Analytics

↓

Autosave

↓

History

---

# Plugin Lifecycle

Plugins follow a predictable lifecycle.

```
Register

↓

Initialize

↓

Load Assets

↓

Register Components

↓

Register Property Definitions

↓

Register Commands

↓

Ready

↓

Dispose
```

In code, a plugin module exports two functions:

```ts
export function activate(api: PluginApi): void | Promise<void> // runs during Initialize
export function deactivate(): void | Promise<void> // runs during Dispose
```

`activate` performs every registration above through `api`. Everything it registers is disposed automatically when the plugin is deactivated.

---

# Plugin Manifest

Every plugin contains a manifest.

Required metadata:

- Name
- ID
- Version
- Description
- Author
- Category
- Compatibility
- Permissions

Example:

```
Checkout Plugin

Version 1.0

Components

Payment Element

Coupon

Order Summary
```

---

# Component Registration

Each visual component registers itself.

A component defines:

- ID
- Name
- Icon
- Category
- Default Properties
- Default Styles
- Default Children
- Validation Rules
- Renderer
- Property Definitions (the inspector is generated from these)
- Theme Slot (optional)

The editor never hardcodes components.

Everything is discovered through the registry.

---

# Component Categories

The canonical list of components, with type ids and owning plugins, is the **Component Catalog** in [component-library.md](./component-library.md). The grouping below is illustrative.

Layout

- Section
- Container
- Grid
- Stack
- Spacer
- Divider

Typography

- Heading
- Text
- Badge

Media

- Image
- Video
- Icon

Forms

- Input
- Select
- Checkbox
- Radio

Checkout

- Payment Element
- Order Summary
- Coupon
- Order Bump
- Shipping
- Taxes

Marketing

- Testimonial
- FAQ
- Countdown
- Logos
- Trust Badges

---

# Property Registration

Every editable property is registered.

Properties include:

Typography

Spacing

Layout

Border

Background

Shadow

Animation

Responsive

Accessibility

Advanced

The inspector builds itself dynamically.

---

# Events

The editor emits events.

Examples:

NodeAdded

NodeRemoved

NodeMoved

NodeSelected

SelectionChanged

Undo

Redo

Published

Saved

PluginInstalled

PluginRemoved

Plugins may subscribe to any public event.

---

# Commands

Commands are globally available.

Every command contains:

ID

Title

Category

Shortcut

Handler

Availability

Commands appear inside:

- Command Palette
- Toolbar
- Context Menu
- Keyboard Shortcuts

---

# Validation

Plugins may contribute validators.

Example:

Payment Plugin

Validates:

- Payment Element exists

- Product exists

- Currency configured

- Stripe connected

Validation returns:

Info

Warning

Error

Critical

---

# Renderer Registration

The renderer loads components dynamically.

Example:

```
Schema Node

↓

Component Registry

↓

Renderer

↓

React Component
```

The renderer never imports components directly.

---

# Styling System

Plugins never write CSS directly.

All styling is token based.

Supported style groups:

Typography

Spacing

Layout

Flex

Grid

Effects

Background

Borders

Animations

Visibility

Responsive

---

# Inspector API

Plugins register inspector sections.

Example:

Button

↓

Typography

↓

Spacing

↓

Hover

↓

Accessibility

↓

Advanced

Sections support:

Search

Collapse

Reset

Responsive overrides

---

# Toolbar API

Plugins may contribute:

Buttons

Dropdowns

Toggle Groups

Menus

Separators

Toolbar items must remain minimal.

Avoid clutter.

---

# Keyboard Shortcuts

Plugins may register shortcuts.

Shortcuts bind to commands, never to handlers directly.

Example:

⌘⇧↵

Publish

⌘⌥P

Preview

⌘D

Duplicate

Delete

Remove

Plugins must not override existing shortcuts without permission.

Reserved browser and operating system shortcuts may never be registered.

Plugins should prefer chords under the ⌥K leader.

The complete shortcut map, scope model, and registration rules are defined in [keyboard-shortcuts.md](./keyboard-shortcuts.md).

---

# Permissions

Plugins request capabilities.

Examples:

Read Schema

Modify Schema

Publish

Access Assets

Access Payments

Access Clipboard

Restricted permissions require user approval.

---

# Asset Support

Plugins may register assets.

Supported types:

Images

Icons

Fonts

Videos

SVG

Lottie

Assets are optimized automatically.

---

# AI Integration

Plugins may expose AI capabilities.

Examples:

Generate FAQ

Rewrite Heading

Improve CTA

Suggest Layout

Generate Testimonials

AI responses should always remain editable.

---

# Error Isolation

One plugin should never crash the editor.

Every plugin runs inside an isolated boundary.

Plugin failures display recoverable error messages.

---

# Version Compatibility

Every plugin specifies:

Minimum editor version

Maximum editor version

Supported schema version

Unsupported plugins are disabled automatically.

---

# Performance Requirements

Plugins must:

Load lazily

Avoid unnecessary re-renders

Dispose listeners correctly

Avoid memory leaks

Remain responsive during drag operations

---

# Security

Plugins never receive:

Stripe Secret Keys

Database credentials

Private user information

Sensitive operations occur only through secure server APIs.

---

# Future Plugin Marketplace

Future versions of Checkout Studio will support:

Plugin installation

Plugin updates

Plugin ratings

Verified plugins

Premium plugins

Organization plugins

Private plugins

The architecture should require no changes when the marketplace is introduced.

---

# Plugin Development Principles

Every plugin should be:

Independent

Composable

Reusable

Testable

Documented

Versioned

Observable

Secure

A plugin should be installable or removable without affecting the stability of the editor.

That is the primary goal of the Plugin API.
