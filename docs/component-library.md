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

Registered by the engine itself, not by a plugin:

| Type id                | Purpose                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `core.unsupported`     | Holds a node whose type is not registered, preserving its data. See [renderer.md](./renderer.md). |
| `core.symbol-instance` | Places a project symbol. See [schema.md](./schema.md).                                            |

Names used informally elsewhere map to this table: "Product" → `checkout.product-card`, "Shipping" → `checkout.shipping-selector`, "Taxes" → `checkout.tax-summary`, "Logos" → `marketing.logo-wall`, "Radio" → `core.radio-group`, "Phone" and "Email" → `core.input` variants.

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
