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

## Measured, not assumed

`pnpm bench:canvas` drives a real browser against a 2,000-node page and prints
every number. It is a tool rather than a gate: it is not in CI, because a shared
runner cannot be held to a frame budget, and a benchmark that fails for the
machine's reasons is one people learn to ignore.

Each measurement carries two numbers. The **budget** is the target from
docs/phases.md and is printed, not asserted. The **ceiling** is asserted — a
ratchet set just above where the canvas measures today, so ordinary variance
passes and a regression fails. Lower a ceiling when the canvas gets faster;
never raise one to make a run green.

### What the first version measured, and why it was wrong

It recorded the interval between animation frames and compared the 95th
percentile against 16.67ms. That number cannot mean what it was taken to mean.
On a 60Hz display frames _arrive_ every 16.7ms however idle the page is, so a
percentile of the interval is a property of the display, not of the canvas.

Measured here, in the same browser seconds apart:

```
a page with no input at all     p95 17.40ms
panning 2,000 nodes             p95 17.50ms
```

The first version reported the second of those as "the pan criterion is not
met". What it had found was the refresh rate. Two of the three criteria it
called unmet were measured this way — the selection metric waited on
`requestAnimationFrame` after writing the selection, so most of what it
reported was the wait for the next vsync — and the gap it attributed to the
overlay layer re-rendering with the transform was not there to explain.

### What is measured now

The frame interval is used for the one thing it does say: whether a frame was
**missed**. A browser that cannot finish in time does not return a slightly
larger interval, it skips a vsync and returns roughly double, so a threshold
halfway between one period and two separates the two cases.

Everything else is the cost a gesture **adds** to an idle frame, which is what
the 16.67ms budget is actually about — how much of a frame's working time the
gesture consumes. Every measurement calibrates against its own idle page first,
in the same browser on the same machine, which also makes the numbers meaningful
on a 120Hz laptop or a throttled runner where a hardcoded 16.67 would be wrong
in both directions.

Selection is held to its median rather than its tail, and that is a tightening
rather than a softening. The latency from writing the selection to the overlay
changing includes React committing, which its scheduler may do in the same task
or behind the frame already in flight; measured over six runs the p95 moved
between 3.9 and 5.3ms while the median stayed within 0.5ms. A ceiling has to
sit above the worst tail to be usable, and by then it is above the cost it was
meant to catch.

The panel is measured the same way, and for the same reason. Timing the
`scrollTo` call reported between 0.00 and 1.60ms for identical code, because a
scroll is handled asynchronously: what it timed was the request. Timing until
the rows change reports 8.2–8.7ms, which is both credible and stable.

As of Phase 7, on a developer machine also running Postgres and Redis, across
eight runs:

```
pan: work added to a frame      -0.1–0.8ms   ceiling 3ms    ok
zoom: work added to a frame      0.7–2.3ms   ceiling 4ms    ok
drag: work added to a frame      0.0–0.3ms   ceiling 3ms    ok   (sustained)
drag: starting it                1–2 frames, as the preview mounts
frames missed while sustaining   0 of ~200                  ok
selection to overlay (median)    0.7–1.4ms   ceiling 4ms    ok
selection to overlay (p95)       3.9–5.3ms   budget 16ms    ok
one edit re-renders nothing      100% kept                  ok
layers panel window rebuild      8.2–8.7ms   budget 100ms   ok
rows rendered of 2,000           46                         ok
```

**All five criteria are met**, against a 16.67ms frame and a 16ms selection
budget. The earlier claim that three were not met was the instrument, not the
canvas.

A negative figure is not an error: the work pan adds is smaller than the
difference between two idle measurements taken a second apart, so the number it
should be reported as is "below the noise floor", and printing −0.1 says that
more honestly than rounding it to zero would.

The one real finding of the first version survives: the canvas re-renders on
every frame of a pan because it owns the transform, and the renderer is a plain
function component, so the whole document re-rendered with it — two thousand
nodes, sixty times a second, for a transform that changes nothing any of them
depends on. That was a genuine 31ms frame, and the current benchmark fails on it
twice over: 14ms of added work against a 4ms ceiling, and missed frames against
a threshold of zero.

### Waste that is not expensive

Counters on `ResizeObserver`, `getBoundingClientRect` and the store, over the
same gestures, found real excess work. Per gesture, before anything changed:

```
pan,   40 moves        3 observers built,  10 forced clientWidth reads
zoom,  30 notches    150 observers built, 256 forced clientWidth reads
select, 20 changes    59 observers built,  80 getBoundingClientRect per change
```

Two separate causes, handled differently.

The first is a defect, and is fixed. The effect that publishes the canvas's
shape depended on an object rebuilt every render, so an effect written to run
"on every change" ran on every _render_ — sixty times a second during a pan,
each one forcing a layout to read the surface and writing to the store, for a
transform that moves nothing it reports. One `useMemo` on a pure function's
result took the whole pan gesture to 1 store write, 0 observers and 0 forced
reads, and halved zoom's.

The second is not fixed, deliberately. Three hooks each hold "observe this
element" and "take this measurement" in one effect with one dependency list, so
changing _what to measure_ tears down and rebuilds an observer watching an
element that has not moved. Splitting them removes the remaining churn
entirely — and measuring the result, three runs each way, showed it buys about
0.4ms on zoom and nothing on pan or selection. Per the rule below, profiling did
not show benefit, so the complexity is not justified. The diagnosis is recorded
here so that if a later feature makes a per-frame store write or a per-change
observer expensive, nobody has to find it twice.

### Starting a gesture is not sustaining one

The drag measurement failed the moment it existed: 11.7ms of added work and two
dropped frames of forty. Seven explanations were tried and six were wrong.

```
React re-rendering the preview per frame   memoised it — 11.7 → 10.4ms
the renderer re-inserting a stylesheet     profile counted zero <style> inserts
opacity and the shadow on a moving layer   removed both — no change
hover re-measuring during the drag         removed it — no change
resolveDrop traversing 2,000 nodes         measured directly — 0.303ms
dropRejection                              measured directly — 0.003ms
the raster area of a 1440x80 layer         capped it to 320 — no change
```

What found it was the dumbest available test: run the drag for a hundred moves
instead of forty. **0.3ms added, one frame missed of a hundred.** The cost was
the preview's subtree mounting, once, on the first frame of the gesture — and
over forty frames that single frame _is_ the 95th percentile.

So the instrument was too short to tell "slow" from "slow once", which is the
same class of mistake as measuring the display's refresh rate and calling it the
canvas: a number that is real and does not mean what it is being read to mean.
The benchmark now reports the two separately — the frames missed while starting,
printed, and the frames missed while sustaining, asserted — because "sustains 60
FPS" is a claim about the second.

Two of the six wrong guesses left improvements behind and are kept on their own
merits, with their comments corrected to say so: the canvas no longer calls
`getBoundingClientRect` on every pointer move (the pan's added work went from
0.3ms to 0.0ms), and hover stops while something is being dragged, because the
drop indicator already answers what the pointer is over.

### Proving the instrument can fail

A benchmark nobody has seen fail is a benchmark nobody should trust, and this
one replaced a metric that passed a real 31ms regression. So the regression was
reintroduced — the memoisation of the rendered page removed — and measured:

```
pan: frames missed      1 of 42                 FAIL
zoom: frames missed    21 of 88                 FAIL
zoom: work added        9.60ms (ceiling 4ms)    FAIL
selection median        6.00ms (ceiling 4ms)    FAIL
```

Three of the three timing measurements fail, where the version this replaced
caught two. That run also found a presentation bug worth keeping in mind: it
printed the added work against the 16.67ms frame budget, so a gesture that had
just dropped twenty-one frames was labelled "ok". A share of a frame is not a
frame. The missed count answers whether 60 FPS is held; the added work answers
how much of a frame the gesture costs, and is printed against its own ceiling.

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

**Split in two, as built.** Measurement in Phase 6 found that 126.8 KB of the 133.6 KB the route serves is React DOM and Next's App Router client runtime, leaving 6.8 KB that is ours. One figure covering both would hold the component library to about 16 KB, so it is now two:

```
First-party       < 60 KB   the gate — our code, and what it imports
Framework floor   < 150 KB  a tripwire — nothing we write moves it
```

Together these stay well inside the 350 KB maximum above.

The floor is not removable without giving up something worth more than the bytes. A Route Handler rendering the HTML itself ships zero JavaScript, but React's server layer has no `Component` and no `createContext`, so it cannot host the error boundaries that keep a broken component from breaking a page, nor the plugin providers that carry a cart to a checkout component. The Pages Router keeps both and sheds the App Router's unused ~80 KB of routing and prefetching, but its page graph is shared with the client, so `server-only` stops protecting the database. Both were built and measured; see Phase 6 § As Built in [phases.md](./phases.md).

What makes a budget of this shape sound rather than a concession: the published page is visually complete from the server's HTML, and nothing in the tree waits on hydration to render. This JavaScript governs when the payment element becomes interactive — INP — not when the page paints. Enforced per build by `pnpm renderer:bundle`.

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

# What real components cost

**As built, Phase 9.** Every canvas number this project has published was
measured against a page the product cannot build.

The benchmark harness mounted `fixtureRegistry()` — components whose renderer
is a bare `<div>` with no default styles. Two thousand of those are not two
thousand nodes: a real heading resolves six style properties through the
cascade, half of them token references that become CSS variables, and a real
button resolves fourteen and draws an inline SVG. Phase 7's exit criteria were
signed off on the empty version, and Phase 8's "60 FPS sustained during drag at
2,000 nodes" with it.

Two of the six measurements could not have run against anything else. They
located a node by `[data-ck-node]`, an attribute **only the fixture emits** —
the renderer puts the node id in a class and the canvas hit tests by that. The
fixture's own comment asserted the opposite, which is how it survived: a false
statement about how the canvas works, written beside the thing that made it
look true.

## The numbers, fixtures against the real registry

|                            | fixtures | real          |
| -------------------------- | -------- | ------------- |
| pan, added per frame       | 0.3ms    | 0.1ms         |
| zoom, added per frame      | 1.6ms    | 2.5ms         |
| drag, added per frame      | 0.1ms    | **3.0–3.4ms** |
| selection to overlay, p95  | 6.1ms    | 6.3ms         |
| layers panel rebuild       | 9.1ms    | 7.7ms         |
| frames missed, any gesture | 0        | **0**         |

Pan, selection and the layers panel are unchanged or better. Drag is thirty
times more expensive.

## What did not change

Phase 8's criterion is sixty frames a second sustained during a drag, and that
holds: **0 of 95 frames missed, on every run of four.** Three milliseconds of a
sixteen-millisecond frame is not a dropped frame. What was violated is the
ceiling this project set for itself on added work, and that ceiling had been
calibrated against the empty page — so it was never measuring anything.

It is 5ms now: clear of the observed 3.0–3.4 spread, and still eleven
milliseconds short of the frame, so a doubling is caught. Raising a tripwire is
uncomfortable and correct here. One calibrated against a page nobody can build
measures nothing, and one that fails two runs in three is one people learn to
scroll past.

## What is not known

Where the three milliseconds go. The candidates are a style recalculation over
a document that now has real styles in it, and React reconciling the overlay
layer per frame — but that is two guesses, and this document already carries
the record of seven guesses about a drag frame of which six were wrong. It
wants a profile, not a paragraph.

Recorded rather than closed, because the measurement is worth having on its own:
the benchmark now measures the product.

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

Published JS (first-party) < 60 KB

Published JS (framework floor) < 150 KB

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
