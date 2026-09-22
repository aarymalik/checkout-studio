# Checkout Studio Theme System Specification

**Version:** 1.0

**Status:** Design Token & Theming Architecture

---

# Purpose

The Theme System defines how visual design decisions are expressed, stored, resolved, and applied across Checkout Studio.

It exists to guarantee that:

- No color, size, radius, shadow, or font is ever hardcoded.
- A single change to a token updates every surface that depends on it.
- Published checkouts inherit a coherent brand identity by default.
- Light mode, dark mode, and high-contrast mode are structural, not bolted on.
- The editor chrome and the customer-facing checkout theme remain completely independent.

The theme is what makes a checkout look designed rather than assembled.

---

# Overview

Checkout Studio operates **two separate theme systems**.

Confusing them is the most common architectural mistake in a product like this, so the boundary is defined first.

```
┌───────────────────────────────┐   ┌───────────────────────────────┐
│      STUDIO THEME             │   │      CHECKOUT THEME           │
│  (the product interface)      │   │  (the customer's checkout)    │
├───────────────────────────────┤   ├───────────────────────────────┤
│ Owner:  Checkout Studio        │   │ Owner:  the user              │
│ Lives:  packages/design-system │   │ Lives:  the schema            │
│ Scope:  toolbar, panels,       │   │ Scope:  rendered checkout     │
│         inspector, dialogs     │   │         nodes only            │
│ Modes:  light / dark / system  │   │ Modes:  light / dark          │
│ Edited: never by users         │   │ Edited: visually, by users    │
│ Ships:  with the application   │   │ Ships:  inside the revision   │
└───────────────────────────────┘   └───────────────────────────────┘
```

They share **mechanics** — tokens, tiers, CSS variables, resolution — and share **nothing else**.

A user changing their checkout brand color must never tint the Studio toolbar.

The Studio switching to dark mode must never darken the canvas content.

This document specifies both, marking each section accordingly.

---

# Architecture

```
                        Token Definitions
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
     Studio Token Set                  Checkout Theme (schema)
     (static, versioned)               (dynamic, per project)
              │                                 │
              ▼                                 ▼
      Mode Resolution                    Mode Resolution
      light / dark / hc                  light / dark
              │                                 │
              ▼                                 ▼
      CSS Variable Sheet               CSS Variable Scope
      :root, [data-theme]              .checkout-root
              │                                 │
              ▼                                 ▼
      Tailwind Config                  Style Compiler
      (semantic utilities)             (node → CSS)
              │                                 │
              ▼                                 ▼
        Studio UI                         Rendered Checkout
```

Both pipelines terminate in CSS custom properties.

Neither pipeline produces inline style objects at render time except for genuinely dynamic per-node values.

---

# Design Principles

**Tokens are the only vocabulary.**

If a value cannot be named, it does not belong in the design.

**Three tiers, always.**

Primitive → Semantic → Component. Consumers only ever touch the tier above the one they need.

**Semantic tokens carry meaning, not appearance.**

`--color-surface-raised` survives a rebrand. `--color-gray-50` does not.

**Modes are token swaps, never conditional code.**

No component ever branches on `isDark`.

**Themes describe, they never structure.**

A theme contains no nodes, no layout, no content. Per [schema.md](./schema.md), the theme and the node tree are separate concerns.

**Resolution is deterministic.**

The same node, theme, and breakpoint always produce the same computed style.

**Overrides are stored, defaults are not.**

Storing only deltas keeps schemas small and rebrands total.

**Contrast is validated, not assumed.**

Every semantic pairing is checked against WCAG AA at authoring time.

---

# Token Tiers

## Tier 1 — Primitives

Raw values. No meaning. Never referenced by a component.

```
--blue-50 … --blue-950
--gray-50 … --gray-950
--green, --amber, --red scales
--size-0 … --size-96
--radius-none … --radius-full
--font-sans, --font-mono
--shadow-raw-1 … --shadow-raw-5
--duration-150 · --duration-180 · --duration-200 · --duration-220
```

Primitives are the palette.

They change only when the brand changes.

## Tier 2 — Semantics

Meaning. This is the tier components consume.

```
--color-background
--color-surface
--color-surface-raised
--color-surface-sunken
--color-border
--color-border-strong
--color-foreground
--color-foreground-muted
--color-foreground-subtle
--color-primary
--color-primary-foreground
--color-primary-hover
--color-success
--color-warning
--color-danger
--color-focus-ring
--color-selection
--color-canvas
--duration-fast        → --duration-150
--duration-normal      → --duration-180
--duration-slow        → --duration-220
--easing-standard      → cubic-bezier(0.16, 1, 0.3, 1)
```

Every semantic token resolves to a primitive.

Mode switching rebinds semantics to different primitives. Nothing else moves.

```
Light:  --color-surface → --gray-0
Dark:   --color-surface → --gray-900
```

## Tier 3 — Component Tokens

Component-scoped bindings. Optional, used when a component needs to deviate coherently.

```
--button-primary-bg
--button-primary-fg
--button-radius
--button-height-sm | -md | -lg
--input-border
--input-focus-ring
--card-radius
--card-shadow
--panel-width-left
--panel-width-right
--toolbar-height
```

Component tokens resolve to semantics, never to primitives.

```
--button-primary-bg  →  --color-primary  →  --blue-600
```

Three hops maximum. A fourth hop is a design smell.

---

# Studio Theme

_(Applies to the product interface only.)_

## Values

Derived directly from [design-system.md](./design-system.md).

```
Radius
  sm      8px
  md      12px
  lg      18px
  card    16px
  button  12px
  input   12px
  modal   20px
  panel   18px

Spacing (8px system)
  4 8 12 16 24 32 40 48 64 80 96

Typography
  Sans       Inter
  Secondary  Geist
  Mono       JetBrains Mono

Motion
  fast    150ms
  normal  180ms
  slow    220ms
  easing  cubic-bezier(0.16, 1, 0.3, 1)   /* ease-out */

  Range fixed by CLAUDE.md: nothing animates outside 150–220ms.

Elevation
  1  cards
  2  dropdowns
  3  dialogs
  4  notifications

Layout
  toolbar-height    64px
  status-bar-height 32px
  left-panel        320px  (min 260, max 420, collapsed 64)
  right-panel       340px  (min 300, max 460)
```

These values are the single source for the numbers quoted throughout [ui-guidelines.md](./ui-guidelines.md).

## Modes

```
light      explicit
dark       explicit
system     follows prefers-color-scheme
high-contrast  derived from the active mode
```

Mode is stored per user, not per project, and persists across sessions and devices.

## Mode Application

```html
<html data-theme="dark" data-contrast="normal"></html>
```

```css
:root {
  --color-surface: var(--gray-0);
  --color-foreground: var(--gray-950);
}

[data-theme="dark"] {
  --color-surface: var(--gray-900);
  --color-foreground: var(--gray-50);
}

[data-contrast="high"] {
  --color-border: var(--color-foreground);
  --color-focus-ring: var(--color-foreground);
}
```

The attribute is written to `<html>` before first paint by a blocking inline script.

There is no flash of incorrect theme.

## Tailwind Binding

Tailwind is configured against semantic tokens only.

```ts
// tailwind.config.ts
colors: {
  background: "var(--color-background)",
  surface: "var(--color-surface)",
  foreground: "var(--color-foreground)",
  primary: {
    DEFAULT: "var(--color-primary)",
    foreground: "var(--color-primary-foreground)",
  },
  border: "var(--color-border)",
}
```

Result

```tsx
<div className="bg-surface text-foreground border-border" />
```

Per [coding-standards.md](./coding-standards.md), a raw hex value in a component is a review failure.

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-normal: 0ms;
    --duration-slow: 0ms;
  }
}
```

Motion tokens collapse to zero.

No component needs to know.

---

# Checkout Theme

_(Applies to rendered checkouts only.)_

## Position in the Schema

Themes are **project-level records** (`Theme` in [database.md](./database.md)).

A page's draft schema holds a reference, never a copy:

```json
{
  "version": "1.0.0",
  "projectId": "...",
  "pageId": "...",
  "theme": { "themeId": "theme_x7d9", "overrides": {} },
  "settings": {},
  "variables": {},
  "root": "section_x7d9",
  "nodes": {}
}
```

```
Draft          → references the project theme by themeId (+ sparse page overrides)
Editor canvas  → resolves the reference live, so a theme edit shows instantly on every page
Publish        → resolves the reference once and snapshots the result into the revision
Published page → renders the snapshot, immune to later theme edits
```

Nodes reference theme tokens.

Nodes never copy theme values.

## Theme Interface

```ts
export interface CheckoutTheme {
  id: string
  name: string
  version: string

  /** Optional parent for inheritance. */
  extends?: string

  colors: ThemeColors
  typography: ThemeTypography
  spacing: ThemeSpacing
  radius: ThemeRadius
  shadows: ThemeShadows
  motion: ThemeMotion
  /** Keyed by component type id. Slot shapes are contributed by plugins. */
  components: Record<string, ComponentThemeSlot>

  /** Dark mode overrides. Sparse — only what differs. */
  dark?: DeepPartial<Omit<CheckoutTheme, "dark" | "id" | "name" | "version">>

  metadata: ThemeMetadata
}

export interface ThemeColors {
  /** Brand seed. Scales are derived from this. */
  primary: string
  primaryForeground: string

  background: string
  surface: string
  surfaceRaised: string

  foreground: string
  foregroundMuted: string

  border: string
  borderStrong: string

  success: string
  warning: string
  danger: string

  focusRing: string

  /** Named custom colors the user has defined. */
  custom: Record<string, string>
}

export interface ThemeTypography {
  fontFamily: {
    heading: FontDefinition
    body: FontDefinition
    mono: FontDefinition
  }
  scale: {
    display: TypeStyle
    h1: TypeStyle
    h2: TypeStyle
    h3: TypeStyle
    h4: TypeStyle
    bodyLarge: TypeStyle
    body: TypeStyle
    small: TypeStyle
    caption: TypeStyle
  }
  /** Global multiplier applied per breakpoint. */
  fluidScale: Record<Breakpoint, number>
}

export interface TypeStyle {
  fontSize: string
  lineHeight: string
  letterSpacing: string
  fontWeight: number
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"
}

export interface FontDefinition {
  family: string
  source: "google" | "system" | "custom"
  weights: number[]
  /** Present when source is "custom". */
  assetId?: string
  fallback: string[]
}

export interface ThemeSpacing {
  /** Base unit in px. Default 8. */
  base: number
  scale: number[]
  /** Multiplier per breakpoint for global density control. */
  density: Record<Breakpoint, number>
}

export interface ThemeRadius {
  none: string
  sm: string
  md: string
  lg: string
  full: string
}

export interface ThemeShadows {
  none: string
  sm: string
  md: string
  lg: string
  xl: string
}

export interface ThemeMotion {
  durationFast: string
  durationNormal: string
  durationSlow: string
  easing: string
}

/** Opaque to the engine. Validated against the slot schema its plugin registered. */
export type ComponentThemeSlot = Record<string, unknown>

/** Registered by a plugin through plugin-sdk, alongside its components. */
export interface ComponentThemeSlotRegistration {
  componentType: string // e.g. "core.button", "checkout.payment-element"
  schema: ZodType // validates the slot's values
  defaults: ComponentThemeSlot // used when the theme omits the slot
  label: string // shown in the Theme panel
}

export interface ThemeMetadata {
  author?: string
  createdAt: string
  updatedAt: string
  isPreset: boolean
  presetId?: string
  tags: string[]
}

export type Breakpoint = "desktop" | "tablet" | "mobile"
```

## Component Theme Slots

Component slots let a theme restyle every instance of a component without touching a single node.

The engine does not know which slots exist. Each plugin registers the slot for each of its components, so the core plugins contribute `core.button`, `core.input`, and `core.badge`, and the checkout plugin contributes `checkout.payment-element` and `checkout.order-summary`. A second product adds its own slots without touching the engine.

The shapes below are the slot the core plugin registers for `core.button`.

```ts
export interface ButtonTheme {
  variants: {
    primary: ButtonVariantTheme
    secondary: ButtonVariantTheme
    ghost: ButtonVariantTheme
    outline: ButtonVariantTheme
    danger: ButtonVariantTheme
  }
  sizes: {
    sm: ButtonSizeTheme
    md: ButtonSizeTheme
    lg: ButtonSizeTheme
  }
  radius: string
  fontWeight: number
  transition: string
}

export interface ButtonVariantTheme {
  background: string
  foreground: string
  border: string
  shadow: string
  hover: Partial<Omit<ButtonVariantTheme, "hover" | "active" | "disabled">>
  active: Partial<Omit<ButtonVariantTheme, "hover" | "active" | "disabled">>
  disabled: Partial<Omit<ButtonVariantTheme, "hover" | "active" | "disabled">>
}

export interface ButtonSizeTheme {
  height: string
  paddingX: string
  fontSize: string
  gap: string
  iconSize: string
}
```

Changing `theme.components["core.button"].variants.primary.background` restyles every primary button on every page in the project.

---

# Style Resolution

The resolution order is fixed and is the contract quoted in [renderer.md](./renderer.md).

```
1. Theme Defaults
        ↓
2. Component Defaults
        ↓
3. Node Base Styles
        ↓
4. Responsive Overrides   (desktop → tablet → mobile)
        ↓
5. State Overrides        (hover, focus, active, disabled)
        ↓
6. Visibility & Conditions
        ↓
   Computed Style
```

Later stages win.

No stage may reorder.

## Worked Example

```
Theme
  colors.primary            #2563EB
  components.button.radius  12px
  typography.scale.body     16px / 1.5

Component defaults (core.button)
  paddingX  24px
  height    44px

Node styles (desktop)
  height    52px

Responsive override (mobile)
  height    44px
  width     100%

State override (hover)
  background  darken(primary, 8%)

Computed on mobile
  background  #2563EB
  radius      12px
  fontSize    16px
  paddingX    24px
  height      44px
  width       100%
```

Only `height` on desktop, `height` and `width` on mobile, and the hover background were ever stored.

Everything else was inherited.

## Responsive Cascade

Values cascade downward, never upward.

```
Desktop  (base)
   ↓ inherits
Tablet   (overrides only)
   ↓ inherits
Mobile   (overrides only)
```

Editing at the desktop breakpoint changes the base and therefore affects all breakpoints.

Editing at tablet or mobile writes an override affecting that breakpoint and narrower.

This matches the responsive editing behavior described in [editor-behavior.md](./editor-behavior.md).

## Reference Syntax

Node styles reference tokens by path.

```json
{
  "styles": {
    "desktop": {
      "backgroundColor": "{colors.primary}",
      "borderRadius": "{radius.lg}",
      "fontSize": "{typography.scale.h2.fontSize}",
      "padding": "{spacing.6}"
    }
  }
}
```

Rules

- A reference that cannot be resolved falls back to the component default and emits a warning.
- References may not chain more than three levels.
- Circular references are rejected at validation time, before render.
- Literal values are permitted but flagged in the inspector as "detached from theme".

---

# CSS Variable Generation

The theme compiles to CSS custom properties **once** per render, scoped to the checkout root.

```css
.checkout-root {
  --ck-color-primary: #2563eb;
  --ck-color-primary-fg: #ffffff;
  --ck-color-surface: #ffffff;
  --ck-color-foreground: #0a0a0a;
  --ck-radius-lg: 18px;
  --ck-space-6: 24px;
  --ck-font-heading: "Inter", system-ui, sans-serif;
  --ck-duration-normal: 200ms;
}

.checkout-root[data-mode="dark"] {
  --ck-color-surface: #0a0a0a;
  --ck-color-foreground: #fafafa;
}
```

Rules

- Prefix `--ck-` keeps theme variables distinct from anything a merchant's Custom CSS or a component's own styles declare.
- Scoping to `.checkout-root` rather than `:root` lets the editor canvas render a checkout inside the Studio document without the two themes interfering.
- Embedded checkouts need neither for isolation: they render inside an iframe, per [renderer.md](./renderer.md).
- Generation is memoized on the theme id and version.
- The variable sheet is emitted server-side during SSR so there is no unstyled flash.

Nodes then reference variables, not values.

```html
<button style="background: var(--ck-color-primary); border-radius: var(--ck-radius-lg)"></button>
```

A theme change updates a handful of variable declarations rather than thousands of inline styles.

---

# Color Derivation

Users pick one brand color. The system derives a coherent scale.

```
primary  #2563EB

↓ derive

50   #EFF6FF
100  #DBEAFE
200  #BFDBFE
300  #93C5FD
400  #60A5FA
500  #3B82F6
600  #2563EB   ← seed
700  #1D4ED8
800  #1E40AF
900  #1E3A8A
950  #172554
```

Derivation operates in a perceptually uniform color space (OKLCH), not in sRGB, so lightness steps look even across hues.

Derived automatically

```
primaryHover      seed shifted -6% lightness
primaryActive     seed shifted -12% lightness
primaryForeground contrast-optimal white or near-black
focusRing         seed at 40% alpha
selection         seed at 15% alpha
```

`primaryForeground` is chosen by measuring contrast against the seed and selecting whichever of white or near-black exceeds 4.5:1. If neither does, the seed is adjusted and the user is warned.

Users may override any derived value. Overrides are marked as manual and are never recomputed.

---

# Dark Mode

_(Checkout themes.)_

Dark mode is a sparse override layer, not a second theme.

```ts
theme.dark = {
  colors: {
    background: "#0A0A0A",
    surface: "#141414",
    foreground: "#FAFAFA",
    border: "#262626",
  },
}
```

Everything not overridden is inherited from the light theme.

Rules

- Primary brand color usually stays constant; only surfaces and text invert.
- Shadows lose opacity and gain a subtle border in dark mode, because shadows are nearly invisible on dark surfaces.
- Images with transparent backgrounds may need a per-node dark variant. The Image component supports `darkSrc`.
- Elevation in dark mode is expressed by surface lightness, not shadow depth.

Mode selection for a published checkout

```
auto     follow the visitor's prefers-color-scheme
light    force light
dark     force dark
```

Configured in project settings, stored in `settings`, not in the theme itself.

---

# Theme Presets

Presets are curated starting points shipped with the platform.

```
Minimal        Neutral, generous whitespace, subtle borders
Bold           High contrast, heavy weights, large radius
Elegant        Serif headings, tight tracking, warm neutrals
Technical      Mono accents, sharp radius, dense spacing
Soft           Rounded, pastel, low contrast shadows
Luxury         Dark surfaces, gold accent, wide letter spacing
```

Applying a preset

```
Choose preset

↓

Preview live on the canvas (non-destructive)

↓

Confirm

↓

Preset merges into the project theme

↓

Manual overrides are preserved
```

Presets never overwrite a value the user has explicitly set.

The inspector marks which values came from the preset and offers a per-value reset.

---

# Brand Kit

A Brand Kit is a project-level identity that seeds new themes.

```ts
export interface BrandKit {
  id: string
  projectId: string
  logo: { light: string; dark: string; favicon: string }
  colors: { primary: string; secondary?: string; accent?: string }
  fonts: { heading: FontDefinition; body: FontDefinition }
  radiusPreference: "sharp" | "rounded" | "pill"
  densityPreference: "compact" | "comfortable" | "spacious"
  voice?: { tone: string; keywords: string[] }
}
```

Every new page in the project inherits the Brand Kit.

Templates installed into the project are re-themed against it automatically, which is what makes a template look like it belongs.

The `voice` field is consumed by the AI Assistant for copy generation. See [ai-assistant.md](./ai-assistant.md).

---

# Theme Inheritance

```
Platform Preset
      ↓ extends
Organization Theme        (future — see roadmap Phase 22)
      ↓ extends
Project Theme
      ↓ extends
Page Theme Override       (rare, sparse)
      ↓
Node Style Overrides
```

Rules

- Inheritance is resolved once, at load, producing a flat effective theme.
- The flat theme is what the renderer receives. It never walks a chain at render time.
- Cycles are rejected at validation.
- Depth is capped at 4.

---

# Theme Versioning

Themes are versioned independently of the schema.

```
theme.version  1.4.0
```

Rules

- Editing a theme in place bumps the patch version.
- Publishing snapshots the theme **into the revision**, per [history-versioning.md](./history-versioning.md).
- A published checkout is therefore immune to later theme edits.
- Restoring a revision restores its theme snapshot.

This is why a published page never changes appearance unexpectedly.

---

# Font Loading

```
Theme declares fonts

↓

Renderer computes the required subset
(families × weights actually used by nodes)

↓

Google fonts   → fetched once into our asset pipeline, self-hosted,
                 emitted as @font-face + <link rel="preload"> by the renderer
Custom fonts   → asset URL, font-display: swap, preloaded
System fonts   → no network request

↓

CSS variables bound to families
```

Rules

- Only weights actually referenced by nodes are loaded.
- Maximum 2 families and 4 total weights per checkout by default; exceeding this raises a performance warning in the inspector.
- Variable fonts are preferred and count as a single weight.
- `font-display: swap` with a metric-matched fallback keeps CLS under the 0.1 budget in [performance.md](./performance.md).
- Fonts are preloaded in the document head during SSR.

---

# Internal Structure

```
packages/design-system/src/            STUDIO THEME
├── tokens/
│   ├── primitives.ts                  raw scales
│   ├── semantics.ts                   role-based tokens
│   └── components.ts                  component-scoped tokens
├── themes/
│   ├── light.ts
│   ├── dark.ts
│   └── high-contrast.ts
├── css/
│   ├── variables.css                  generated custom properties
│   └── reset.css
├── tailwind/
│   └── tokens.css                     @theme block: semantic tokens → utilities
├── motion/
│   └── tokens.ts
└── index.ts

packages/schema/src/theme/             CHECKOUT THEME
├── types.ts                           CheckoutTheme and friends
├── defaults.ts                        the default theme
├── presets/                           Minimal, Bold, Elegant, …
├── validate.ts                        value validation + CSS injection guards
├── inherit.ts                         extends chain flattening
├── derive/
│   ├── scale.ts                       primary → 50…950
│   └── contrast.ts                    WCAG pairing checks
│                                      (both use OKLCH conversion from
│                                       @checkout-studio/utils, imported from the package root)
└── index.ts

packages/renderer/src/styles/          RESOLUTION + EMISSION
├── compile.ts                         theme → CSS variables
├── resolve.ts                         the six-stage cascade
├── responsive.ts                      breakpoint inheritance
├── tokens.ts                          {token.path} reference resolution
└── fonts.ts                           subset computation + preloading

packages/editor/src/theme/             AUTHORING
├── store.ts                           theme slice
├── panel/                             the Theme panel UI
├── picker/                            token picker + detach indicator
└── validate.ts                        live contrast validation
```

Note on naming: the renderer's public prop is typed `Theme`, per [renderer.md](./renderer.md). `CheckoutTheme` is the full canonical name used in this document to distinguish it from the Studio Theme. They are the same type.

---

# Editor Integration

## Theme Panel

Located in the left sidebar, per [ui-guidelines.md](./ui-guidelines.md).

```
Theme
├── Brand
│   ├── Primary color        (picker + derived scale preview)
│   ├── Logo
│   └── Favicon
├── Colors
│   ├── Semantic tokens
│   └── Custom colors
├── Typography
│   ├── Heading font
│   ├── Body font
│   └── Type scale
├── Spacing
│   ├── Base unit
│   └── Density
├── Radius
├── Shadows
├── Components
│   ├── Buttons
│   ├── Inputs
│   ├── Cards
│   └── Payment Element
└── Dark Mode
```

## Live Preview

Every theme change applies to the canvas immediately.

Because the canvas consumes CSS variables, a theme edit updates a variable declaration rather than re-rendering the tree.

Target: theme change reflected in under 16ms regardless of node count.

## Token Picker

Any style input in the inspector offers a token picker beside the raw value input.

```
Background   [ ▓ Primary          ▾ ]   ← token, tracks the theme
Background   [ #2563EB            ✎ ]   ← literal, detached
```

Detached values display a subtle indicator and a one-click "reattach to theme" action.

## Contrast Validation

The theme panel validates every semantic pairing continuously.

```
foreground / background        AA required
primaryForeground / primary    AA required
foregroundMuted / surface      AA required
border / surface               3:1 recommended
```

Failures are surfaced inline with a suggested correction, never blocked outright — the user may have a reason. Warnings persist in the publish pre-flight check.

---

# Workflows

## Rebrand an entire project

```
Theme panel → Brand → change primary color

↓

Scale derived in OKLCH

↓

CSS variables recomputed

↓

Canvas updates instantly

↓

Every page, every button, every accent follows
```

No node was edited. No page was opened.

## Apply a preset to an existing project

```
Choose preset → live preview

↓

Diff shown: 34 tokens change, 6 manual overrides preserved

↓

Confirm

↓

Single undoable history entry
```

## Ship a template that adapts to the buyer's brand

```
Template authored against semantic tokens only

↓

Exported with its theme (see export-import.md)

↓

Installed into a project with a Brand Kit

↓

Theme strategy: keep-target (the template adopts the project theme)

↓

Template renders in the buyer's brand
```

This only works because the template used no literal colors. Template validation enforces it.

## Add dark mode to a live checkout

```
Theme panel → Dark Mode → enable

↓

Surfaces and text auto-inverted, brand color preserved

↓

Contrast validated

↓

Preview in dark

↓

Adjust images with darkSrc where needed

↓

settings.colorMode = "auto"

↓

Publish
```

---

# Best Practices

**Never write a literal color in a component.**

Use a semantic token. This is enforced by lint per [coding-standards.md](./coding-standards.md).

**Name by role, not by appearance.**

`--color-surface-raised`, not `--color-light-gray`.

**Keep dark overrides sparse.**

If the dark object is nearly as large as the light theme, the semantic layer is wrong.

**Derive, do not enumerate.**

Ask the user for one brand color, not eleven.

**Cap the type scale.**

Six sizes is plenty. More produces incoherence, per [ui-guidelines.md](./ui-guidelines.md).

**Snapshot the theme on publish.**

A published page must never change because someone edited a theme months later.

**Validate contrast at authoring time.**

Catching it at publish is late. Catching it in production is a lawsuit.

**Scope checkout variables.**

`.checkout-root`, never `:root`. The editor canvas depends on it, since the checkout and the Studio share one document there.

**Treat component slots as the escape hatch.**

Reach for a component slot before adding a new semantic token.

---

# Performance Considerations

| Operation                      | Target   |
| ------------------------------ | -------- |
| Theme compile to CSS variables | < 5 ms   |
| Theme change → canvas repaint  | < 16 ms  |
| Color scale derivation         | < 2 ms   |
| Style resolution per node      | < 0.1 ms |
| Full theme swap (2,000 nodes)  | < 50 ms  |
| Font subset resolution         | < 10 ms  |

Techniques

**Compile once, apply everywhere.**

The variable sheet is generated once per theme version and cached by `themeId:version`.

**Never re-render on theme change.**

Because nodes reference variables, a theme edit changes a stylesheet, not a React tree. This is the single most important optimization in the system.

**Memoize style resolution.**

Cache key: `nodeId:styleHash:themeVersion:breakpoint`. Invalidate on any component of the key.

**Resolve the active breakpoint only — on the canvas.**

In editor-preview mode, never compute tablet and mobile styles while the user edits desktop, per [performance.md](./performance.md). Published pages are the opposite: they emit every breakpoint as media-query CSS, because the server cannot know the viewport. See **Responsive Rendering** in [renderer.md](./renderer.md).

**Strip defaults on write.**

A node whose styles equal the theme defaults stores an empty object.

**Precompute derived scales.**

Derivation runs on color change in the editor, not per render.

**Server-render the variable sheet.**

Prevents both FOUC and layout shift, protecting the CLS budget.

---

# Security Considerations

The theme is user-authored data that becomes CSS. It is sanitized accordingly.

**Value validation.**

Every theme value is parsed and validated against its expected type before it reaches a stylesheet.

```
Colors      hex, rgb(), hsl(), oklch() only
Lengths     numeric + allowed unit only
Fonts       family name allowlist + quoted fallbacks
Shadows     parsed component-wise, never passed through raw
Easing      named easings or cubic-bezier() with 4 numbers
```

**CSS injection.**

Rejected in every theme value

```
url(javascript:...)
expression(...)
@import
behavior:
-moz-binding
Unbalanced quotes, parens, semicolons, or braces
```

A value failing validation falls back to the component default and is reported. It is never emitted.

**Custom fonts.**

Font assets are validated by magic bytes, served from our own storage, and never loaded from arbitrary third-party origins. This is required by the Content Security Policy in [security.md](./security.md).

**Custom CSS.**

The project-level Custom CSS setting is scoped to `.checkout-root` by an AST transform, so a user cannot style the Studio chrome when their checkout renders on the editor canvas.

**Embed isolation.**

Embedded checkouts render inside an iframe on a page we host, so the host page's styles, variables, and scripts cannot reach them. Isolation comes from the iframe boundary, not from variable naming.

**No script execution.**

A theme can never produce executable code. This follows directly from the renderer rule that schema content is never evaluated.

---

# Testing Requirements

```
Token resolution         every semantic resolves to a valid primitive
Cascade order            all six stages, in order, with conflicts
Responsive inheritance   desktop → tablet → mobile, override isolation
Mode switching           no component reads a mode flag
Contrast                 every semantic pairing meets AA
Color derivation         perceptual evenness across 12 seed hues
CSS injection            every payload in the rejection fixture is blocked
Variable scoping         checkout variables never leak to :root
Theme snapshot           published revision immune to later theme edits
Inheritance cycles       rejected at validation
Performance              theme swap on a 2,000-node tree under 50 ms
Font subsetting          only referenced weights requested
```

Visual regression covers every preset in light and dark at all three breakpoints, per [testing.md](./testing.md).

---

# Future Expansion

The architecture absorbs the following without a breaking change.

**Organization themes.**

An inheritance tier above the project, arriving with Phase 22.

**Theme marketplace.**

Themes are already versioned, exportable, and self-contained. Distribution reuses the bundle format in [export-import.md](./export-import.md).

**Per-audience theming.**

Resolving a different theme by geography, campaign, or experiment arm. The resolution pipeline already accepts a theme at load time.

**Motion themes.**

Named motion personalities layered over the existing motion tokens.

**AI theme generation.**

Generate a coherent theme from a logo, a URL, or a description. Output is a `CheckoutTheme` object, validated like any other.

**Theme diffing.**

Visual comparison of two theme versions, reusing the version-compare surface in [history-versioning.md](./history-versioning.md).

**Additional color spaces.**

P3 and Rec2020 for wide-gamut displays, with sRGB fallbacks. The derivation pipeline already works in OKLCH.

**Cross-product themes.**

The same theme applied to a landing page, funnel, or email built on the same engine.

---

# Success Criteria

The system is successful when:

- Changing one brand color visually rebrands an entire project in under 16 milliseconds.
- No component anywhere in the codebase contains a hardcoded color, size, radius, or shadow.
- Dark mode requires no conditional logic in any component.
- Every shipped preset passes WCAG AA on every semantic pairing.
- A published checkout's appearance is frozen at publish time and never drifts.
- A template authored elsewhere adopts the installing project's brand automatically.
- An embedded checkout, rendered in its iframe, is visually unaffected by its host page.
- Theme resolution for a 2,000-node tree completes within one frame.

---

# Philosophy

A theme is not a color picker.

It is the compression of a thousand design decisions into a few dozen named values.

When tokens are right, design becomes systematic: consistency stops being a discipline and becomes a property of the architecture. A user who has never opened a design tool gets a checkout that looks intentional, because the intentionality lives in the system rather than in their patience.

The Studio theme makes the tool feel premium.

The Checkout theme makes the user's work feel like theirs.

Neither should ever be mistaken for the other.
