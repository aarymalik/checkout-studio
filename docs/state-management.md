# Checkout Studio State Management Specification

**Version:** 1.0

**Status:** Core Editor State Architecture

---

# Overview

The Checkout Studio editor is powered by a centralized state engine.

The state engine is responsible for:

- Project state
- Component tree
- Selection
- Drag & Drop
- History
- Clipboard
- Responsive styles
- Theme
- Autosave

The editor should behave like Figma rather than a traditional React application.

---

# Goals

The state engine must provide:

- Fast updates
- Predictable behavior
- Minimal re-renders
- Unlimited scalability
- Deterministic state
- Easy serialization

---

# State Library

Use

Zustand

with

Immer

for immutable updates.

Avoid Redux.

Avoid Context for editor state.

---

# Core Principles

- Single source of truth
- Normalized data
- Immutable updates
- Selector-based subscriptions
- Serializable state
- No duplicated data

---

# Architecture

```
Editor

↓

Actions

↓

Zustand Store

↓

History

↓

Subscribers

↓

React Components
```

---

# State Modules

The editor state consists of independent modules.

```
Project

Pages

Nodes

Selection

History

Clipboard

Viewport

Theme

Assets

Inspector

Publishing
```

Each module should remain isolated.

---

# Node Structure

Each component is represented as a node.

Example

```ts
interface Node {
  id: string

  type: string

  parentId: string | null

  children: string[]

  props: Record<string, unknown>

  styles: ResponsiveStyles

  visibility: VisibilityRules

  animations: AnimationDefinition[]

  metadata: NodeMetadata
}

interface VisibilityRules {
  /** Hidden by the user. Not rendered anywhere, including the published page. */
  hidden: boolean

  breakpoints?: Breakpoint[]

  conditions?: VisibilityCondition[]
}

interface NodeMetadata {
  /** Editor-only. Never affects rendering. */
  locked: boolean

  displayName?: string

  notes?: string

  tags?: string[]
}
```

`hidden` affects rendering, so it belongs to visibility.

`locked` affects only editing, so it belongs to metadata.

This follows the rule in [schema.md](./schema.md) that metadata never affects rendering.

Nodes reference each other by ID.

Never nest complete objects.

---

# Tree Structure

```
Root

↓

Section

↓

Container

↓

Grid

↓

Column

↓

Button
```

Only IDs are stored.

---

# Builder State

```ts
interface BuilderState {
  projectId: string

  pageId: string

  rootNodeId: string

  nodes: Record<string, Node>

  selection: SelectionState

  viewport: ViewportState

  history: HistoryState

  theme: ThemeState

  clipboard: ClipboardState
}
```

---

# Selection

Support

Single Selection

Multi Selection

Box Selection

Keyboard Selection

Selection state stores IDs only.

---

# Multi Selection

Supported operations

Move

Delete

Duplicate

Group

Ungroup

Copy

Paste

Lock

Hide

---

# History

History supports

Undo

Redo

Restore

History stores

immutable snapshots

or

patches.

Maximum

50 states.

---

# Undo Flow

```
Current State

↓

Apply Action

↓

Save History

↓

Update Store
```

---

# Autosave

Autosave

5 seconds after the last change, and at most 30 seconds apart during continuous editing.

Only save when changes exist.

Never interrupt editing.

---

# Dirty State

Track

Saved

↓

Modified

↓

Saving

↓

Saved

Prevent unnecessary saves.

---

# Clipboard

Clipboard stores

Serialized Node Tree

Supports

Copy

Cut

Paste

Duplicate

Cross-project paste

Future

Cross-workspace paste.

---

# Node Operations

Supported

Add

Move

Delete

Duplicate

Replace

Wrap

Unwrap

Lock

Hide

Rename

---

# Responsive Styles

Every node contains

Desktop

Tablet

Mobile

styles.

Example

```ts
styles: {

desktop:{},

tablet:{},

mobile:{}

}
```

Only changed values are stored.

---

# Theme

Global theme stored separately.

Never duplicate theme values inside nodes.

---

# Viewport

Stores

Zoom

Pan

Breakpoint

Guides

Grid

Snap

---

# Inspector

Stores

Selected Tab

Expanded Panels

Search

Filter

Inspector state should not affect canvas rendering.

---

# Assets

Stores

Images

Fonts

Videos

Icons

Upload status

Search state

---

# Publishing

Tracks

Draft

Published

Revision

Publishing status

---

# Derived State

Compute

Selected Node

Breadcrumbs

Parent Chain

Computed Styles

Visibility

Never duplicate derived values.

---

# Selectors

Every component subscribes only to required state.

Example

Good

```
Button

↓

Button State
```

Bad

```
Button

↓

Entire Store
```

---

# Re-render Strategy

Updating one button

must never

re-render the whole canvas.

---

# Actions

Actions should be grouped.

Examples

Selection Actions

Node Actions

History Actions

Clipboard Actions

Viewport Actions

Publishing Actions

---

# Drag & Drop

Drag state remains separate.

Tracks

Dragging Node

Drop Target

Drop Position

Preview

Guides

---

# Transactions

Complex actions

execute atomically.

Example

Duplicate Section

↓

Create Nodes

↓

Generate IDs

↓

Reconnect Children

↓

Insert

↓

History

↓

Render

---

# Serialization

Entire editor state must serialize to JSON — but only the document is ever persisted.

```
Builder State

↓

toSchema(state)        ← projection: drops selection, viewport, history,
                         clipboard, inspector, drag state
↓

CheckoutSchema (schema.md top-level shape: version, settings, theme, variables, root, nodes)

↓

JSON Patch against the draft

↓

Database
```

`BuilderState` also holds session-only UI state. Persisting it would violate the rule in [schema.md](./schema.md) that no UI state is stored in the schema. `toSchema` is the only path from the store to the database, and `fromSchema` the only path back.

No runtime objects.

---

# Deserialization

JSON

↓

Validation

↓

Migration

↓

State

↓

Render

---

# Validation

Validate every loaded or imported state.

Reject

Broken references

Duplicate IDs

Circular trees

Never reject

Unknown component types. They load as `core.unsupported`, carrying their original data, so a page that used a since-removed plugin still opens — and fully recovers when the plugin returns. See [export-import.md](./export-import.md).

---

# Performance

Target

2,000+

nodes

while maintaining

60 FPS.

---

# Memory

Avoid duplicate data.

Release unused references.

Limit history size.

---

# Collaboration Ready

The pre-collaboration concurrency model — session locks, optimistic version checking, and conflict resolution — is defined in [history-versioning.md](./history-versioning.md).

Architecture should support

future

real-time collaboration.

Every action should be deterministic.

Future support

CRDT

Operational Transform

Yjs

---

# Testing

Test

Undo

Redo

Selection

History

Clipboard

Serialization

Import

Export

Autosave

Drag

Responsive styles

---

# Error Recovery

The corruption recovery procedure is defined in [error-handling.md](./error-handling.md).

If state becomes invalid

↓

Restore previous history

↓

Log error

↓

Continue editing

Never corrupt project data.

---

# Design Rules

Never mutate state directly.

Never duplicate information.

Never store UI state inside nodes.

Every action should be deterministic.

State should always be serializable.

---

# State Philosophy

The state engine is the brain of Checkout Studio.

Every editor feature interacts with the state engine.

A clean state architecture enables scalability, performance, collaboration, and reliability across the entire platform.
