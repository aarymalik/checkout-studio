# Checkout Studio Component Library

**Version:** 1.0

**Status:** Component Specification

---

# Overview

Every visual element inside Checkout Studio is a Component.

Components are:

- Reusable
- Responsive
- Accessible
- Plugin-based
- JSON-driven

Each component defines:

- Purpose
- Default Properties
- Editable Properties
- Validation
- Responsive Behavior
- Accessibility
- Renderer Output

---

# Component Categories

Declared by each component, not inferred. `ComponentDefinition.category` is a
union of exactly these eight, so a typo is a type error rather than a ninth
group appearing in the library panel with one component in it — and it is
required, because a component nobody can find is a component nobody uses and a
default would file the ones that forgot somewhere their absence goes unnoticed.

The library panel is built from the registry and groups by this field in the
order below, leaving out the categories nothing is in. That is what makes a
plugin's components appear by being registered: there is no list anywhere to
update.

```
Layout

Typography

Media

Forms

Checkout

Marketing

Navigation

Utility
```

---

# Component Catalog

This table is the single source of component type ids. Every other document refers here.

Type ids take the form `<namespace>.<kebab-name>`. The `core` namespace is shared by the `core-*` plugins; the registry rejects a duplicate id at registration.

| Type id                      | Component                                        | Category   | Plugin         | Phase |
| ---------------------------- | ------------------------------------------------ | ---------- | -------------- | ----- |
| `core.section`               | Section                                          | Layout     | `core-layout`  | 9     |
| `core.container`             | Container                                        | Layout     | `core-layout`  | 9     |
| `core.grid`                  | Grid                                             | Layout     | `core-layout`  | 9     |
| `core.stack`                 | Stack                                            | Layout     | `core-layout`  | 9     |
| `core.columns`               | Columns                                          | Layout     | `core-layout`  | 9     |
| `core.spacer`                | Spacer                                           | Layout     | `core-layout`  | 9     |
| `core.divider`               | Divider                                          | Layout     | `core-layout`  | 9     |
| `core.heading`               | Heading                                          | Typography | `core-content` | 9     |
| `core.text`                  | Text                                             | Typography | `core-content` | 9     |
| `core.badge`                 | Badge                                            | Typography | `core-content` | 9     |
| `core.image`                 | Image                                            | Media      | `core-content` | 9     |
| `core.video`                 | Video                                            | Media      | `core-content` | 9     |
| `core.icon`                  | Icon                                             | Media      | `core-content` | 9     |
| `core.button`                | Button                                           | Navigation | `core-content` | 9     |
| `core.link`                  | Link                                             | Navigation | `core-content` | 9     |
| `core.html-block`            | HTML Block                                       | Utility    | `core-embed`   | 9     |
| `core.code-block`            | Code Block                                       | Utility    | `core-embed`   | 9     |
| `core.embed`                 | Embed                                            | Utility    | `core-embed`   | 9     |
| `core.lottie`                | Lottie                                           | Utility    | `core-embed`   | 9     |
| `core.input`                 | Input (text · email · phone · number · password) | Forms      | `core-forms`   | 10    |
| `core.textarea`              | Textarea                                         | Forms      | `core-forms`   | 10    |
| `core.select`                | Select                                           | Forms      | `core-forms`   | 10    |
| `core.checkbox`              | Checkbox                                         | Forms      | `core-forms`   | 10    |
| `core.radio-group`           | Radio Group                                      | Forms      | `core-forms`   | 10    |
| `core.address`               | Address                                          | Forms      | `core-forms`   | 10    |
| `core.country`               | Country Selector                                 | Forms      | `core-forms`   | 10    |
| `checkout.product-card`      | Product Card                                     | Checkout   | `checkout`     | 11    |
| `checkout.product-list`      | Product List                                     | Checkout   | `checkout`     | 11    |
| `checkout.order-summary`     | Order Summary                                    | Checkout   | `checkout`     | 11    |
| `checkout.coupon`            | Coupon                                           | Checkout   | `checkout`     | 11    |
| `checkout.shipping-selector` | Shipping Selector                                | Checkout   | `checkout`     | 11    |
| `checkout.tax-summary`       | Tax Summary                                      | Checkout   | `checkout`     | 11    |
| `checkout.order-bump`        | Order Bump                                       | Checkout   | `checkout`     | 11    |
| `checkout.trust-badges`      | Trust Badges                                     | Checkout   | `checkout`     | 11    |
| `checkout.guarantee-box`     | Guarantee Box                                    | Checkout   | `checkout`     | 11    |
| `checkout.payment-element`   | Payment Element                                  | Checkout   | `checkout`     | 13    |
| `checkout.express-checkout`  | Express Checkout                                 | Checkout   | `checkout`     | 13    |
| `marketing.countdown`        | Countdown                                        | Marketing  | `marketing`    | 11    |
| `marketing.testimonial`      | Testimonial                                      | Marketing  | `marketing`    | 11    |
| `marketing.faq`              | FAQ                                              | Marketing  | `marketing`    | 11    |
| `marketing.logo-wall`        | Logo Wall                                        | Marketing  | `marketing`    | 11    |
| `marketing.reviews`          | Reviews                                          | Marketing  | `marketing`    | 11    |
| `marketing.progress-bar`     | Progress Bar                                     | Marketing  | `marketing`    | 11    |

| `core.page` | Page | Layout | `core-layout` | 9 |

`core.page` is `ROOT_TYPE` in packages/schema: every document this product
creates has a root node of that type, and the renderer renders the root as an
ordinary node. It was missing from this table for the whole of Phases 5 to 8,
during which every page — canvas and published alike — resolved its root to the
unsupported fallback. It is not insertable: a user does not add the page they
are already inside.

Registered by the engine itself, not by a plugin:

| Type id                | Purpose                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `core.unsupported`     | Holds a node whose type is not registered, preserving its data. See [renderer.md](./renderer.md). |
| `core.symbol-instance` | Places a project symbol. See [schema.md](./schema.md).                                            |

Names used informally elsewhere map to this table: "Product" → `checkout.product-card`, "Shipping" → `checkout.shipping-selector`, "Taxes" → `checkout.tax-summary`, "Logos" → `marketing.logo-wall`, "Radio" → `core.radio-group`, "Phone" and "Email" → `core.input` variants.

---

# How a component is written

**As built**, with Section as the reference — docs/phases.md Phase 9 step 1.

Three files per component, always:

```
definition.ts   what the engine knows: type, category, defaults, whether it holds children
Renderer.tsx    what the browser gets
properties.ts   what the inspector offers, as data
```

No component ships an inspector panel. `properties.ts` is a list of
descriptions validated against the schema in plugin-sdk, and Phase 12 generates
the panel from it. Each definition names a `key` and a `target` of `"prop"` or
`"style"`, which is not a filing decision: only a style is stored per breakpoint
and per state, so only a style can be responsive. Everything the catalog calls
editable on a Section is a style; Heading's text will be a prop.

Defaults are **not** repeated in a property definition. They live in
`defaultProps` and `defaultStyles`, where the cascade reads them, so the two
cannot drift.

Default styles reference theme tokens rather than literals — `{spacing.9}`
compiles to `var(--ck-space-9)` — so a theme that changes its spacing scale
moves every section on every page without a document being rewritten.

A plugin ships three entry points, and the split is the budget: `./renderer`
holds definitions and renderers, `./editor` holds property definitions, and
nothing in the renderer's module graph imports the second. A customer paying on
a checkout has no use for the fact that Section's overflow control is a select
with four options.

**Shared property definitions.** Six layout components list Padding and the
catalog means the same control each time, so the common ones are written once in
`src/components/common.ts` and each component composes the list the catalog
gives it. Six copies would be six chances for one to drift into offering only
`px`, and nobody would notice until a user could not type a percentage.

**Responsiveness is not a component feature.** A component never sees a
resolved style — it is handed a class — so "a row that becomes a column on a
phone" is the user setting Direction at the mobile breakpoint and the cascade
doing the rest. That is why a property that has to vary by breakpoint must be a
style and not a prop: the document stores per-breakpoint overrides for styles
only, and the property schema refuses a prop that claims otherwise.

**Where a number that is not a token lives.** A Container's maximum width has no
spacing token to reference — that scale tops out at 96 — and 1120px here with
960px on the next page is not a choice anybody made. So it goes in the theme,
through `themeSlot`: stage 1 of the cascade, overridable per node by stage 3.
Container is its first real use.

---

# Layout Components

---

## Section

Purpose

Top-level layout container.

Contains:

- Containers
- Grids
- Stacks

Editable

- Width
- Max Width
- Background
- Padding
- Margin
- Border
- Radius
- Shadow
- Overflow

Supports

- Responsive
- Background Image
- Video Background

---

## Container

Purpose

Limits content width.

Editable

- Width
- Max Width
- Padding
- Alignment
- Gap

Children

Unlimited

---

## Grid

Purpose

Responsive CSS Grid.

Editable

- Columns
- Gap
- Alignment
- Auto Flow

Supports

Desktop

Tablet

Mobile

---

## Stack

Purpose

Vertical or horizontal flex layout.

Editable

- Direction
- Gap
- Wrap
- Alignment
- Justify

---

## Columns

Purpose

Multi-column layouts.

Editable

- Column Count
- Width
- Gap
- Responsive Collapse

**As built.** Three of the four are controls. "Responsive Collapse" is not: the
column count is responsive, so collapsing is setting it to one at the mobile
breakpoint. A separate switch would be a second way to say the same thing, and
the two would disagree the first time somebody used both.

Columns and Grid overlap, and the overlap is worth saying out loud. Grid is
two-dimensional — a count of columns that children flow into row by row, with
the flow itself editable. Columns is one row of equal columns, which is what a
page is made of when a product sits beside its description.

---

## Spacer

Purpose

Creates spacing.

Editable

Height

Responsive

---

## Divider

Purpose

Visual separator.

Editable

Thickness

Color

Width

Style

Margin

---

# Typography

---

## Heading

Purpose

Primary titles.

Levels

H1-H6

Editable

Text

Font

Size

Weight

Line Height

Letter Spacing

Alignment

Gradient

Shadow

Animation

**As built.** Nine of the ten, plus the level.

**Animation is not a component property.** A node's animations live on the node
— `node.animations` in the schema — and belong to the engine's animation
editor, which every component gets without declaring it. A property here would
be a second place to set the same thing.

**The level is not the size.** They are separate controls on purpose: an `h2`
that needs to look small is a style change, not a demotion. The level decides
the element, because the element is the meaning — a screen reader user
navigates a page by its headings.

A level that is not one of 1–6 is read as 2 rather than rendered. A document can
hold anything a previous version wrote or a careless import produced, and `h7`
is not an element: React renders an unknown tag, the browser treats it as an
inline span, and the heading is visibly a heading and structurally not.

**Heading order is checked at the page level**, not here — no heading can
answer it alone. A skipped level and a page with no level-1 heading are both
warnings, and neither blocks a publish: a heading order is a judgement about
content, and refusing to publish over one would be the editor overruling
somebody who can see their own page.

---

## Text

Purpose

Paragraph content.

Editable

Everything from Heading

-

Lists

Links

Rich formatting

**As built.** Everything from Heading is here, minus the level — a paragraph has
no place in the outline — and minus the gradient, which is a thing for a title
rather than for body copy.

Lists, links and rich formatting are **not built**. They need a representation
for inline marks and the schema has none: `PropValue` could hold one, but what
shape it takes decides what the inline editor in Phase 12 can do, and inventing
it from a renderer's side would be deciding that by accident.

A typed line break is a line break: the default styles set `white-space:
pre-wrap`, because without it a paragraph written over three lines renders as
one and nothing on screen explains why.

---

## Badge

Purpose

Small labels.

Editable

Text

Color

Background

Radius

Icon

**As built.** Four of the five. Icon is not a control: it would need the icon
set, which belongs to `core.icon`, and a badge holding a component would be a
container — which a badge is not. A Stack with an Icon and a Badge in it does
this already.

Its colours default to `primary` and `primaryForeground`, which is the one pair
a theme guarantees is readable together. A badge that picked `foreground` on
`primary` would be dark grey on indigo, and whether that was legible would
depend on the brand.

---

# Media

---

## Image

Purpose

Display images.

Editable

Source

Alt Text

Width

Height

Aspect Ratio

Radius

Object Fit

Lazy Load

---

## Video

Purpose

Embedded video.

Supports

YouTube

Vimeo

MP4

Editable

Autoplay

Controls

Loop

Mute

Poster

---

## Icon

Purpose

SVG Icons.

Supports

Lucide

Heroicons

Custom SVG

Editable

Size

Stroke

Color

Rotation

---

# Forms

---

## Input

Supports

Text

Email

Phone

Number

Password

Editable

Placeholder

Validation

Width

Label

Help Text

Default Value

---

## Textarea

Editable

Rows

Placeholder

Validation

---

## Select

Editable

Options

Placeholder

Default Value

Searchable

---

## Checkbox

Editable

Label

Required

Checked

---

## Radio Group

Editable

Options

Layout

Required

---

## Address

Supports

Google Places (future)

Editable

Country

Required Fields

---

# Checkout Components

---

## Product Card

Purpose

Displays product information.

Editable

Image

Title

Price

Sale Price

Description

Quantity

SKU

Inventory

---

## Product List

Displays multiple products.

Editable

Columns

Sorting

Filtering

Spacing

---

## Order Summary

Displays

Subtotal

Shipping

Discount

Taxes

Total

Editable

Labels

Currency

Typography

Visibility

---

## Coupon

Editable

Placeholder

Button Text

Validation Message

Success Message

---

## Payment Element

Purpose

Stripe Payment Element.

Behavior, theming, deferred loading, and failure states are defined in [stripe-integration.md](./stripe-integration.md).

Supports

Cards

Apple Pay

Google Pay

Link

Bank Payments

Editable

Theme

Layout

Border

Radius

Appearance

Validation

---

## Express Checkout

Supports

Apple Pay

Google Pay

Link

Editable

Button Style

Theme

Height

---

## Shipping Selector

Editable

Shipping Methods

Labels

Prices

Default

---

## Tax Summary

Editable

Tax Label

Display Mode

Calculation Type

---

## Order Bump

Purpose

Upsell checkbox.

Editable

Title

Description

Price

Image

Badge

Animation

---

## Trust Badges

Editable

Icons

Text

Layout

Spacing

---

## Guarantee Box

Editable

Icon

Title

Description

Background

Border

---

# Marketing Components

---

## Countdown

Editable

Target Date

Timezone

Labels

Colors

Expired State

---

## Testimonial

Editable

Avatar

Name

Role

Review

Stars

Company

---

## FAQ

Editable

Questions

Answers

Icons

Animation

---

## Logo Wall

Editable

Columns

Spacing

Grayscale

Hover Effect

---

## Reviews

Editable

Stars

Source

Count

Rating

---

## Progress Bar

Editable

Value

Maximum

Label

Animation

---

# Navigation

---

## Button

Editable

Text

Icon

Width

Height

Padding

Radius

Shadow

Gradient

Border

Hover

Pressed

Disabled

Loading

Target

Link

Analytics Event

---

## Link

Editable

Text

URL

Target

Underline

Color

Hover

---

# Utility Components

---

## HTML Block

Purpose

Embed custom HTML.

Supports

HTML (sanitized against an allowlist of tags and attributes)

CSS Classes

Attributes (event handlers and `javascript:` URLs stripped)

`<script>` is never rendered.

---

## Code Block

Supports

CSS (scoped to `.checkout-root`)

HTML (sanitized, as HTML Block)

JavaScript is not supported.

Tracking is configured through Tracking Integrations in page settings, per [schema.md](./schema.md).

Third-party widgets use the Embed component.

---

## Embed

Supports

YouTube

Vimeo

Calendly

Typeform

Custom iframe

Every embed renders in a sandboxed `<iframe>`.

Embeds cannot be placed in the same section as a Payment Element.

---

## Lottie

Editable

Animation

Loop

Speed

Direction

---

# Common Properties

Every component supports:

Typography

Spacing

Layout

Background

Border

Radius

Shadow

Opacity

Visibility

Animations

Responsive

Accessibility

Advanced

---

# Responsive Behavior

Desktop

↓

Tablet

↓

Mobile

Components inherit values.

Only overrides are stored.

---

# Accessibility

Every component must support:

ARIA

Keyboard Navigation

Focus States

Screen Readers

Semantic HTML

Contrast Validation

---

# Validation

Components define their own validation.

Examples

Heading

Cannot be empty.

Image

Requires source.

Payment

Requires Stripe configuration.

Button

Requires destination.

---

# Inspector Sections

Every component exposes, in the order defined by [ui-guidelines.md](./ui-guidelines.md):

General

Layout

Spacing

Typography

Background

Border

Effects

Animation

Responsive

Accessibility

Advanced

---

# Toolbar Actions

Every component supports:

Duplicate

Copy

Paste

Delete

Lock

Hide

Bring Forward

Send Backward

Wrap

Group

---

# Context Menu

Right-click actions

Duplicate

Delete

Copy

Paste

Group

Ungroup

Lock

Hide

Rename

---

# Keyboard Shortcuts

See [keyboard-shortcuts.md](./keyboard-shortcuts.md).

Duplicate

⌘D

Delete

Delete

Copy

⌘C

Paste

⌘V

Undo

⌘Z

Redo

⌘⇧Z

---

# Renderer Contract

Every component provides:

Renderer

Property definitions (properties.ts) — the inspector is generated from these

Validation

Default Styles

Default Props

Toolbar Actions

Schema Definition

---

# Future Components

Planned additions

Carousel

Tabs

Accordion

Pricing Table

Feature Grid

Timeline

Charts

Maps

Calendars

Chat Widget

Donation Widget

Membership Selector

Affiliate Banner

Subscription Selector

AI Components

Marketplace Components

---

# Engineering Principles

Components should be:

Reusable

Composable

Accessible

Responsive

Plugin-based

Testable

Independent

Every component should work without knowledge of any other component.

That principle keeps Checkout Studio modular and scalable.
