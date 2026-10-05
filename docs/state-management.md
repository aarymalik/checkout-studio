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

## The two halves

The engine decides **when** to save and what to do about a failure. It is pure
apart from its timers: it takes a `save` callback and a queue, so it is tested
without a server.

The writer decides **what goes on the wire** and what the answer means. It is
tested without timers.

Keeping them apart is deliberate, and it has one cost worth knowing: both halves
can pass their own tests while nothing connects them. That is exactly what
happened — `createAutosave` was complete and tested for two phases while no part
of the application called it, so every edit in the editor was lost on reload. The
integration is therefore tested too, in the application and end to end against
the database.

## What goes on the wire

The API takes an RFC 6902 patch against the version it last answered for, and has
no unconditional write path — [api-spec.md](./api-spec.md) § Save Draft. So a
save is never "here is the document". It is "here is what changed since the
version you gave me".

The writer holds the document the server agreed to and compares it with the
current one. That copy advances **only** when a write succeeds, which is what
makes a retry send the same patch rather than one computed against a version the
server never held.

Computed by comparing rather than by collecting. The history already holds Immer
patches, but they are grouped, capped at fifty and inverted by undo, so
reconstructing "everything since the last save" from them is a different and far
easier problem to get wrong. Two documents and a compare have no state to drift.

An empty patch is not sent. The engine compares bytes before calling, so this is
the narrow case where the document differs from what the engine last wrote but
not from what the server holds.

## What an answer means

```
Accepted        the base advances, and so does the version the next write uses
Conflict        stop. Somebody has to choose which document survives
Transient       queue it and retry with backoff: offline, a 500, a timeout,
                or being told to slow down
Rejected        stop. The server refused the write itself, and asking again
                sends the same refusal
```

The fourth is the one worth spelling out. A malformed patch, or one that would
produce something that is not a page, means a bug on our side — and retrying it
every sixty seconds forever is worse than stopping and saying so. In the replay
queue it is also dropped, because an entry the server will never accept would
otherwise block every entry behind it on every reload.

## Durability

A failed save goes to a queue in IndexedDB, so it survives closing the tab.

IndexedDB is unavailable in a private window with storage blocked, and it can
accept the open and then refuse every request. Either way the queue falls back to
memory and says so once: losing the queue when the tab closes is much worse than
durable, and much better than refusing to edit. The fallback is permanent,
because two queues replaying from two places replay in an order neither of them
knows.

Replay runs before anything new is written, oldest first, each against the version
it was written for.

## Closing the page

`pagehide`, and `visibilitychange` once hidden — not `beforeunload`, which does
not fire on mobile and disqualifies the page from the back-forward cache.

This is best-effort by nature; the request may not finish. It is not the
durability guarantee. It is what keeps the ordinary case of closing a tab from
waiting out the five-second debounce first.

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
