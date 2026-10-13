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

**As built.** All eight, plus a decorative switch.

`alt` is always emitted, because an `<img>` without it is announced by reading
its source — which is how somebody ends up hearing "hero-final-v3-compressed
dot jpg". An `alt=""` is a different claim: it tells assistive technology to
skip the image, which is right for one the text beside it already describes and
wrong for a product photo. Only the author knows which, so a missing
description is a validation error unless they have said the image is
decorative.

The intrinsic width and height come from the resolved asset and are put on the
element, so the browser reserves the space before the bytes arrive. Without
them the page reflows as each image loads, which on a checkout means the button
somebody is reaching for moves.

Nothing renders without a source on a published page. In the editor an empty
box remains, because a component that renders nothing cannot be selected and
the user has no way to give it the source it is missing.

---

## Video

Purpose

Embedded video.

Supports

YouTube

Vimeo

MP4

**As built — self-hosted only, and the content security policy is why.** A
published checkout allows Stripe's origins, whichever tracking integrations the
page has enabled, and our asset CDN; docs/security.md § Content Security Policy
ends "reject unknown sources". A YouTube or Vimeo iframe would be blocked by
the browser, so building one would ship a component that works in the editor
and renders a blank rectangle to a paying customer.

Widening that policy on a payments page has a security argument on both sides
and is not a decision a renderer should make by quietly adding an origin.

Autoplay implies muted rather than trusting two switches to agree: every
browser refuses to autoplay a video with sound, and a page asking for both
would simply not play with nothing on screen to explain it. Autoplay is also
suppressed in the editor whatever the node says — a canvas where four videos
start the moment a page opens is a canvas nobody can work on.

`interactive: false`, which looks wrong and is not. The flag means "this ships
JavaScript to a published page", and a `<video>` is played, paused and scrubbed
by the browser.

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

**As built — a short list of inline paths, not a library.** An icon component
whose name is a prop cannot be tree-shaken: the bundler cannot know which icon
a document will ask for, so it ships all of them. Lucide alone is over a
thousand, on a page whose entire first-party budget is 60 KB and whose job is
to take a payment.

So the set is eight icons drawn on Lucide's 24×24 grid with its stroke
conventions — chosen for what a checkout says: that something is secure,
guaranteed, on its way, or done. Adding one is a line of paths and a reviewed
decision about the bytes.

Custom SVG upload needs asset handling and a sanitiser — an uploaded SVG is a
script execution vector — and belongs with Phase 14.

Sized in `em`, so an icon beside a line of text is the size of that text and
stays so when somebody changes it. Stroked in `currentColor`, so one inside a
muted paragraph is muted without anybody setting it twice.

Labelled or hidden, never neither: an icon carrying meaning on its own needs
words, and one beside text that already says it needs to be skipped.

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

### The first component that ships JavaScript

Everything before Phase 10 renders on the server and hydrates nothing. A field
cannot: somebody types into it, and what they typed has to be remembered,
checked and shown back. `interactive: true` is not machinery — `RenderNode` is
a server component with no hooks, so a `"use client"` renderer ships itself —
it is the fact made visible, because a component declaring it is a component
spending the published bundle's budget.

The budget is 60 KB for everything a customer downloads. A field costs 1.3 KB.

### Deviation: no validation library in the browser

[phases.md](./phases.md) names React Hook Form and the schema is Zod. Zod
cannot ship: one `"use client"` component importing the schema builder put a
403 KB chunk into the bundle and took first-party JavaScript from 6.8 KB to
**95.3 KB against the 60 KB budget**. The gate refused the build.

So a field's rules are stored once, as data. The browser reads them with a
hand-written check of a few hundred bytes; the server builds the Zod object
from the same descriptors, where size does not matter. Two readers of one
description can drift, so both run over one table of cases and are asserted to
agree about whether a value is acceptable.

React Hook Form is not used either, and for the same reason at a smaller
scale: around 12 KB, on the page that still has to fit Stripe's payment element
in Phase 13. What a generated field needs is a value, an error and a way to say
it exists.

### Labels, and what is announced

The label is an element and stays visible. A placeholder disappears the moment
somebody types, so a form built from them is one nobody can check before
submitting. Both are offered; they are different things.

`aria-describedby` points at the help text, and at the error when there is one.
The required mark beside the label is `aria-hidden`, because `aria-required` on
the control is what a screen reader announces — otherwise it reads "asterisk".

A field is checked when it is left, not while it is typed, and its error clears
as soon as somebody starts fixing it.

### On the canvas

Read-only, not disabled. A disabled field is skipped by the keyboard and dimmed,
so the canvas would show the component in a state no published page puts it in.

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

Rendered by Input's component, because the rows are the only thing it has that
an input does not. It is a type of its own because the catalog lists one, and
because somebody looking for "Textarea" in the library should find it rather
than discover it is a setting on something else.

---

## Select

Editable

Options

Placeholder

Default Value

### Deviation: a native select, not a searchable combobox

"Searchable" is listed. A native `<select>` already is: typing jumps to the
matching option, in every browser, with no JavaScript from us. On a phone it
opens the platform's own picker, which is better than anything we would build
and is what people already know.

A custom combobox is a listbox, a filter, a focus manager and a set of
`aria-activedescendant` rules — the most commonly broken widget on the web —
and several kilobytes on a page budgeted at 60 KB that still has to fit
Stripe's payment element. If a merchant turns out to need one over a hundred
options, a Country field is the shape that argument should take.

### The placeholder is a disabled first option

`<select>` has no `placeholder` attribute. The first option carries the empty
value, so choosing it is choosing nothing, and on a required field it is
disabled so it cannot be chosen _back_ to by accident.

### Options are value-and-label pairs

Not a list of strings. A label is read and can be reworded; a value is saved
and must not move. One list would make them the same thing, so fixing a typo
in "Standard delivery" would silently change every answer already collected.

---

## Checkbox

Editable

Label

Required

Checked

### Its label wraps it

Every other field is a label above a control. A checkbox is a tick followed by
its words, and the words _are_ the label — wrapping the input so the whole line
is clickable, which on a phone is the difference between a consent box people
tick and one they keep missing.

That is the one piece of layout it does not share. Everything else is: the
connection to the form is `useField`, the same hook every field uses, because
the first version did its own and quietly did not register — a field that does
not register looks right, holds what somebody ticked, and submits nothing.

### "Has to be ticked", not "is required"

An unticked box is not an unanswered question. "Terms is required" reads as
something missing; what the person has to do is tick it.

---

## Fields on the canvas

A text input and a textarea are **read-only** there: they look exactly as they
will on the page, and cannot be typed into.

A select and a radio group are **disabled**, which dims them, because HTML has
no read-only for either. The alternative is worse than the dimming: an enabled
select on the canvas opens its dropdown when a merchant clicks to select the
node, and an enabled radio changes its own answer when they do.

---

## Radio Group

Editable

Options

Required

### A fieldset, because there is no single control to label

Four radios under one question are four unlabelled controls unless the question
is a `<legend>` inside a `<fieldset>`. A screen reader then announces
"Delivery, radio button, Standard, 1 of 3" — the question, the answer, and the
position. A `<div>` with a heading above it announces "Standard, radio button"
and nothing about what is being asked.

One tab stop, arrows within: the browser's own behaviour for radios sharing a
name, which is why nothing here manages focus.

### Not built: layout

The catalog lists it. A row of radios is a style on the group, and the style
cascade already expresses it — a property that duplicated `flex-direction`
would be a second way to say the same thing, and the two would disagree.

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

**As built.** Fourteen of the sixteen are controls. Hover and Pressed are the
other two, and they are not: the document stores a state layer per style —
stage 5 of the cascade — so every style marked `states: true` already has
hover, focus, active and disabled. Four more controls would be a second way to
write the same thing, and the two would disagree the first time somebody used
both.

**It is a link when it goes somewhere and a button when it does something.** An
anchor styled as a button is still a link: it navigates, it opens in a new tab,
a browser shows where it goes. Scripting that onto a `<button>` would take all
of it away for nothing. The real button carries `type="button"`, which Phase
9's criteria ask for by name — without it a button inside a form submits that
form, and the first anybody knows is a half-filled checkout posting itself.

Disabled works two ways because an anchor has no `disabled`: a link loses its
`href`, which is what actually stops it, and carries `aria-disabled` so it is
announced the same way. Loading sets `aria-busy` and keeps the label in the
accessible name — a spinner that replaced the words would leave a screen
reader user with a button that had silently become nameless halfway through a
purchase.

**`interactive: false`, which was not the expected answer.** Navigating is an
anchor, acting is a button, disabled and busy are attributes, the spinner is
CSS, and the analytics event is a `data-ck-event` attribute that one delegated
listener will read once Phase 18 exists. None of it is JavaScript this
component puts on a page. The first component that genuinely needs a client is
the payment element in Phase 13.

---

## Link

Editable

Text

URL

Target

Underline

Color

Hover

**As built.** Five controls; Hover is the state layer, as on Button.

Underlined by default and it stays that way unless somebody decides otherwise.
Colour alone does not tell a link from text for everybody reading the page —
WCAG 1.4.1 — and roughly one man in twelve cannot rely on the difference
between the two colours a brand picks.

An `<a>` when it has a destination and a `<span>` when it does not. An anchor
with no `href` is not focusable, not announced as a link and not clickable, so
rendering one would be a thing that looks like a link and is not.

## Destinations are checked

Both components put a URL through one guard before it reaches an `href`.

A document is untrusted input: it arrives from the database, from an import,
from a template, and in a workspace from another person. `href="javascript:…"`
runs when somebody clicks it, and docs/security.md already strips those from
HTML and Code blocks for the same reason.

Four schemes are allowed — `http`, `https`, `mailto`, `tel` — along with
relative paths, fragments and queries. `data:` is not: a `data:text/html` link
opens a page the author wrote in an origin the browser treats as ours.

Protocol-relative URLs are refused too, and not because of their scheme.
`//evil.example` resolves to `https://evil.example`, which is allowed when
written out — the problem is that it does not look like it. Somebody typing a
path has typed a path, and a doubled slash silently meaning another site is a
trap with no upside.

`target="_blank"` always carries `rel="noopener noreferrer"`. Without
`noopener` the opened page can reach back through `window.opener` and navigate
the one that opened it, and the page it would be replacing is a checkout.

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

### Built as a tree, not as sanitized text

The stored prop is not markup. The editor parses what the author typed and
stores the tree that survived the allowlist, and the renderer builds elements
from it.

The difference is what is possible rather than what is filtered. A sanitized
string leaves the dangerous value expressible at every step and relies on the
filter; a tree has no branch a `<script>` fits in, which is
[security.md](./security.md) § Scripts on Checkout Pages — "the schema never
contains executable code" — enforced by the shape of the data. It also means
no `dangerouslySetInnerHTML`, so the renderer's rule that raw HTML is written
in exactly one file holds, and no parser or sanitizer is downloaded by a
customer.

### Deviations

**No `<img>`.** Its source would be an origin outside the asset pipeline,
which a published checkout's CSP refuses — the same reason Video is
self-hosted only.

**No `<iframe>`, `<object>` or `<embed>`.** A third-party frame is the Embed
component, where the provider is known.

**No `<form>` or form fields.** A form inside a page that already has a
payment form is a way to collect card details in a box Stripe never sees.

**No `<svg>`.** SVG carries its own script surface and needs its own
sanitizer, deferred to Phase 14 with custom SVG upload.

**No `style` attribute, and no `id`.** Style belongs to the cascade; an inline
declaration would be a seventh stage that always wins. An id is page-global, so
a block that sets one can break an anchor or an `aria-describedby` elsewhere.

### Its contents are styled by the component, from the theme

A block renders semantic HTML, and the cascade reaches nodes — an `<h2>` inside
a block is not one. The first screenshot of this component showed the result: a
heading at body size, a list with no bullets, a link reading as text.

A component may now declare `descendantStyles`, a map of element selector to
declarations, which the renderer emits once per component type on the page and
scopes to that type's own elements. HTML Block's are in `typography.ts` and come
entirely from the theme's type scale, so a block's heading and a Heading node
beside it are the same size and a rebrand moves both.

The alternative was to let Code Block's CSS be the answer, which pairs two
components to make one of them presentable. A merchant who pastes a heading
expects a heading.

The selector grammar is element names and comma lists of them — no combinator,
class, attribute or pseudo-class. The rules are already scoped, so what is left
to express is which elements, and a grammar this small cannot escape its scope.
Code Block takes CSS from a merchant rather than from us and needs a real
scoper; that is its own problem and its own change.

---

## Code Block

Supports

CSS (scoped to the block, not the page — see below)

HTML (sanitized, as HTML Block)

JavaScript is not supported.

Tracking is configured through Tracking Integrations in page settings, per [schema.md](./schema.md).

Third-party widgets use the Embed component.

### Stored as rules, not as a stylesheet

The same argument as HTML Block's tree. A stored string of CSS that the
renderer concatenates into the page's stylesheet is arbitrary CSS one tampered
document away from the payment form. What is stored is a list of selectors and
declarations, which the engine re-emits through its own writer — scoping every
selector and passing every value through the guard the theme is held to. A
stored rule cannot be a rule the engine did not write.

### Deviation: scoped to the block, not to `.checkout-root`

A merchant can already give any node any style, `position: fixed` included,
through the inspector — `styleProperties` is an open record by design. So CSS
here is not a new capability; it is more reach, one rule instead of one node.

On a page carrying a payment form, reach is the part that matters. A rule
matching more than its author expected can cover the Stripe element, hide the
amount, or hide an error — and a document does not always come from the
merchant whose page it is. It arrives from an import, from a template, and in a
workspace from another person.

Scoped to the block, the component still does what it is for: style the markup
in this block. Two Code Blocks on a page are two stylesheets, and neither can
reach the other.

### Deviation: no `@media`

A product decision rather than a safety one. Breakpoints are first-class here —
the inspector sets styles per breakpoint and the renderer emits the queries — and
a merchant writing their own would be a second mechanism the first cannot see.
The block reports it rather than dropping it silently.

`@import` and `@font-face` fetch from an origin the CSP refuses, and
`@keyframes` names animations globally so two blocks could collide. All three
are refused and reported.

### The theme is underneath

A block's markup gets the same typography an HTML Block's does, with the
author's own rules layered over it per selector. A rule saying
`h2 { text-transform: uppercase }` means "and uppercase" — replacing the map
would leave the author's rule working and the heading at body size, which reads
as the theme being broken.

---

## Embed

Supports

YouTube

Vimeo

Calendly

Typeform

Every embed renders in a sandboxed `<iframe>`.

Embeds cannot be placed in the same section as a Payment Element.

### Deviation: no custom iframe

[security.md](./security.md) § Scripts on Checkout Pages ends "every script
origin on a published checkout is enumerated in its Content Security Policy",
and `frame-src` works the same way — a frame loads only from an origin the
policy names. An origin a merchant typed is an origin nobody reviewed, on a
page taking card details. It is the argument that made Video self-hosted only.

With a closed list the policy is derivable: a page's `frame-src` is the origins
of the providers that page uses and nothing else. Phase 16 builds that header
and reads the origins from `PROVIDERS`, so the policy cannot drift from what
the components render.

### The component builds the address

An author gives a provider and an identifier — a video id, a Calendly handle —
and the address comes from a pattern. A component that accepted a URL would be
a component where the origin is whatever the document says, which is what the
closed list exists to prevent.

The identifier patterns are tight, because an identifier goes into a URL and
`../` in one is a different address. YouTube is framed at
`youtube-nocookie.com`: a checkout is not a place to drop a third party's
cookies on somebody who has not pressed play.

### What the sandbox allows back in

`allow-scripts`, because each of these is an application. `allow-popups` so a
booking confirmation can open the merchant's own page. `allow-forms`, because
two of them are forms.

Not `allow-same-origin`: with it a frame reaches its own storage and cookies,
and these four work without it. Not `allow-top-navigation`, which is the one
that matters most — with it a frame can replace the page around it, and a
checkout a customer can be navigated away from mid-payment is the whole risk
in one attribute.

The referrer policy is `strict-origin-when-cross-origin`, so a provider is told
which site framed them and never which checkout page.

### Not loaded in the editor

The canvas draws the box and names the provider; it does not call the service.
Four embeds reaching four third parties when a page opens is slow and watched,
and an editor that fetches a booking page is a service being told about a page
nobody has published.

### Open: an empty media box is nearly invisible

An Embed with no identifier draws the same box Image and Video draw with no
source — `surfaceRaised` on `background`, which on the light theme is very
nearly the page. The first screenshot of this case was a blank page.

A configured Embed now carries the provider's name as text, because otherwise
a set-up video and an empty frame look identical on the canvas. The empty state
is unchanged and is the same for all three components, so fixing it is one
change to a shared idea rather than three to one component each. Not taken yet.

---

## Lottie

Editable

Animation

Loop

Speed

Direction

### Not built, and deferred to Phase 14

Two reasons, either of which is enough. The player is around 250 KB against a
60 KB budget for the whole published checkout. And there is no asset pipeline
for an animation to load from until Phase 14, which is where Image's and
Video's sources already wait.

It is not registered, so the component gallery's coverage test does not ask for
a photograph of a component that does not exist.

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
