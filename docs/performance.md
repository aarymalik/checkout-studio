# Checkout Studio Performance Specification

**Version:** 1.0

**Status:** Performance Architecture

---

# Overview

Performance is a core product feature.

The editor must remain responsive regardless of project size. Users should experience smooth interactions, instant feedback, and fast page rendering.

Performance targets apply to both the Editor and Published Checkouts.

---

# Performance Goals

Editor

- 60 FPS interactions
- < 16ms frame budget
- Instant selection feedback
- Smooth drag-and-drop
- Zero noticeable UI lag

Published Checkout

- Lighthouse Performance ≥ 95
- Largest Contentful Paint (LCP) < 2.5s
- Interaction to Next Paint (INP) < 200ms
- Cumulative Layout Shift (CLS) < 0.1
- First Contentful Paint (FCP) < 1.8s

---

# Core Principles

- Render only what is necessary.
- Avoid unnecessary re-renders.
- Lazy load heavy features.
- Cache aggressively.
- Minimize JavaScript.
- Optimize for perceived performance.

---

# Editor Performance

The editor must support projects with:

- 2,000+ nodes
- 100+ sections
- Hundreds of images
- Multiple breakpoints

without noticeable lag.

---

# Rendering Strategy

React components must only re-render when their own data changes.

Avoid global state subscriptions.

Use selector-based subscriptions.

Example

Bad

Entire canvas re-renders.

Good

Only affected nodes re-render.

---

# State Management

Use normalized state.

```
Node Map

↓

Lookup by ID

↓

Update One Node

↓

Render One Node
```

Never store deeply nested component trees.

---

# Virtualization

Virtualize:

- Layers Panel
- Component Library
- Asset Library
- Template Library
- History Panel
- Search Results

Never render thousands of DOM nodes unnecessarily.

---

# Lazy Loading

Lazy load:

- Templates
- Asset Manager
- AI Assistant
- Analytics
- Settings
- Stripe Editor
- Heavy Dialogs

Editor startup should only load essential modules.

---

# Dynamic Imports

Use dynamic imports for:

- Charts
- Code Editor
- AI Features
- Template Preview
- Image Editor
- Payment Components

---

# Bundle Size Targets

Initial JavaScript

Target

< 250 KB (gzipped)

Maximum

350 KB

Published Checkout

Target

< 150 KB

This budget covers **first-party** JavaScript on the `apps/renderer` published route.

First-party means everything served from our origin, including the React and Next.js runtime. Third-party means scripts from other origins: Stripe.js and enabled tracking integrations.

Deferred third-party dependencies are budgeted separately.

Stripe.js is approximately 100–130 KB gzipped and would consume most of this budget on its own. It is therefore loaded on interaction — first form focus, or 3 seconds after LCP — never on the critical path, and is excluded from the first-party measurement. See [stripe-integration.md](./stripe-integration.md).

---

# Code Splitting

Split by:

- Route
- Feature
- Dialog
- Plugin
- Editor Module

Avoid loading unused code.

---

# Memoization

Use

- React.memo
- useMemo
- useCallback

Only where profiling shows benefit.

Avoid premature optimization.

---

# Images

Automatically

- Resize
- Compress
- Lazy Load
- Generate WebP
- Generate AVIF

Never serve original uploads directly.

---

# Fonts

Studio: use next/font. The Studio's fonts are fixed at build time.

Published checkouts: fonts are chosen by users at runtime, which next/font cannot load. They are self-hosted through the asset pipeline and emitted by the renderer as `@font-face` with `<link rel="preload">`. See [theme-system.md](./theme-system.md).

Only preload required fonts.

Limit font weights.

Use variable fonts where possible.

---

# Icons

Prefer Lucide icons.

Tree-shake unused icons.

Never load full icon libraries.

---

# Canvas Rendering

Selection overlays

Guides

Drop indicators

Resize handles

must render independently from component content.

Moving one node should never re-render the entire canvas.

---

# Drag & Drop

Target

60 FPS

Requirements

- GPU acceleration
- CSS transforms
- No layout thrashing
- Minimal DOM mutations

---

# Animations

Use

Framer Motion

or

CSS transforms

Never animate:

- width
- height
- top
- left

Prefer

transform

opacity

---

# Layout Calculations

Batch layout calculations.

Avoid synchronous measurements.

Use ResizeObserver where appropriate.

---

# Debouncing

Debounce:

Autosave

Search

Resize

Property Inspector updates

Window resize

---

# Throttling

Throttle:

Mouse move

Scroll

Drag events

Canvas guides

---

# Autosave

Autosave

5 seconds after the last change (debounce)

At most 30 seconds apart during continuous editing (maximum wait)

Immediately on publish, close, and manual save

Only save changed data.

Never block the UI.

---

# Network Optimization

Compress

JSON

Responses

Images

Enable

Gzip

Brotli

HTTP/2

HTTP/3

---

# Caching

Cache

Templates

Fonts

Images

Published Schemas

Static Assets

Redis

Project Metadata

Session Data

Published JSON

---

# API Performance

Target Response Time

p50

< 200ms

p95

< 500ms

Endpoints bound to a third party are budgeted separately, because their latency is not ours to control:

Payment Intent creation (Stripe) p95 < 1s

Publish < 5s end to end

AI generation first token < 3s

Long-running tasks should execute asynchronously.

---

# Database Performance

Use

Indexes

Pagination

Selective queries

Connection pooling

Avoid

N+1 queries

Full table scans

---

# Prisma

Always

Select required fields.

Avoid unnecessary includes.

Use transactions where appropriate.

---

# Asset Optimization

Generate

Thumbnail

Medium

Large

Original

Serve only required sizes.

---

# Responsive Rendering

Desktop

Tablet

Mobile

Editor canvas: only compute the active breakpoint.

Published pages: emit all breakpoints as media-query CSS, since the server cannot know the viewport. See [renderer.md](./renderer.md).

---

# Undo / Redo

Store patches or diffs where possible.

Avoid cloning the full state on every action.

History limit

50 states

---

# Memory Usage

Editor should remain under

300 MB

during normal usage.

Release unused resources immediately.

---

# Garbage Collection

Dispose

Observers

Listeners

Timers

Animation frames

Object URLs

when components unmount.

---

# Accessibility Performance

Accessibility must never be disabled for performance.

Optimize implementation instead.

---

# Published Checkout Performance

Prioritize

Fast rendering

Minimal JavaScript

Server-side rendering

Static optimization

Aggressive caching

---

# Loading Strategy

Critical

Immediately

Editor Shell

Canvas

Toolbar

Lazy

Templates

Analytics

AI

Media

Settings

---

# Error Boundaries

The boundary hierarchy is defined in [error-handling.md](./error-handling.md).

Isolate failures.

One component crashing must not crash the editor.

---

# Monitoring

Instrumentation, RUM, and alerting are defined in [observability.md](./observability.md).

Track

FPS

Memory

CPU

Render Time

Slow Components

API Latency

Bundle Size

---

# Profiling

Use

React Profiler

Chrome Performance

Lighthouse

Web Vitals

Regularly benchmark large projects.

---

# Performance Budget

Metric Target

---

Initial JS < 250 KB

Published JS (first-party) < 150 KB

LCP < 2.5s

INP < 200ms

CLS < 0.1

FCP < 1.8s

API Response (p50 / p95) < 200ms / < 500ms

Editor FPS 60

Memory < 300 MB

Undo History 50 States

---

# Optimization Rules

Never optimize without measurement.

Profile before changing.

Measure after changing.

Document every significant optimization.

---

# Performance Philosophy

Fast software feels simple.

Every interaction should feel instant.

The editor should remain responsive regardless of project size.

Performance is a product feature, not a final optimization step.
