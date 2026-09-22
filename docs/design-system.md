# Checkout Studio Design System

**Version:** 1.0

**Status:** Design Foundation

---

# Design Philosophy

Checkout Studio should feel like a premium design tool rather than a traditional dashboard.

Users should immediately feel that they are using software built with craftsmanship.

The interface should communicate confidence through simplicity, spacing, typography, motion, and consistency.

Never design for "maximum information density."

Design for focus.

---

# Design Inspiration

The visual language is inspired by:

- Framer
- Linear
- Raycast
- Stripe Dashboard
- Vercel
- Notion
- Arc Browser

Avoid inspiration from:

- Elementor
- WordPress Admin
- Bootstrap Dashboards
- Legacy SaaS Templates
- Material UI default themes

---

# Core Design Principles

Every screen should feel:

- Calm
- Spacious
- Modern
- Elegant
- Premium
- Fast
- Predictable

Avoid unnecessary borders.

Avoid unnecessary colors.

Avoid visual clutter.

Whitespace is a feature.

---

# Visual Identity

Checkout Studio should communicate:

Precision.

Creativity.

Professionalism.

Performance.

Confidence.

The product should feel expensive.

---

# Design Tokens

Every value in this document is expressed as a design token.

Token tiers, naming, mode switching, and the Tailwind binding are defined in [theme-system.md](./theme-system.md).

Never hardcode a color, size, radius, shadow, or duration.

---

# Color System

## Primary

Blue

Used for:

- Primary actions
- Active selections
- Focus states
- Links

---

## Success

Green

Used only for:

- Success states
- Published pages
- Connected services
- Payments

---

## Warning

Amber

Used for:

- Recommendations
- AI suggestions
- Performance warnings

---

## Error

Red

Used only for:

- Validation
- Errors
- Destructive actions

---

## Neutral

Large grayscale palette.

The UI should primarily use neutral colors.

Color should be reserved for actions.

---

# Border Radius

Small

8px

Medium

12px

Large

18px

Cards

16px

Buttons

12px

Inputs

12px

Modals

20px

Panels

18px

---

# Shadows

Use soft shadows.

Never use harsh shadows.

Four elevation levels:

Level 1 — Cards

Level 2 — Dropdowns

Level 3 — Dialogs

Level 4 — Notifications

Shadows should feel like Linear and Framer.

---

# Typography

Primary Font

Inter

Secondary Font

Geist

Monospace

JetBrains Mono

---

# Typography Scale

Display

Hero

Heading 1

Heading 2

Heading 3

Heading 4

Body Large

Body

Small

Caption

Tiny

Consistent spacing between headings and content.

---

# Spacing System

Use an 8px spacing system.

4

8

12

16

24

32

40

48

64

80

96

Never use arbitrary spacing.

---

# Icons

Lucide Icons

Simple

Consistent

Outline style

Avoid filled icons.

---

# Motion

Motion should communicate state.

Never animate purely for decoration.

Duration

Fast

150ms

Normal

180ms

Slow

220ms

Every animation falls between 150ms and 220ms.

Easing

Ease Out

---

# Buttons

Primary

Solid

Blue

Medium shadow

Secondary

Neutral

Ghost

No background

Outline

Minimal border

Danger

Red

Only for destructive actions.

---

# Inputs

Rounded corners.

Large click area.

Clear focus state.

Never rely solely on color for validation.

Always display helper text.

---

# Cards

Cards should appear elevated through spacing before shadows.

Large padding.

Rounded corners.

Minimal borders.

Soft shadows.

---

# Modals

Large radius.

Background blur.

Centered.

Smooth animation.

ESC closes.

Click outside closes unless destructive.

---

# Dropdowns

Keyboard accessible.

Searchable where appropriate.

Maximum height with scrolling.

---

# Tooltips

Small.

Minimal.

Quick fade animation.

Delay before showing.

---

# Context Menus

Compact.

Keyboard navigable.

Section grouping.

Icons on the left.

Shortcuts on the right.

---

# Panels

Three-panel layout.

Resizable.

Collapsible.

Smooth resizing.

Persistent width.

---

# Canvas

Infinite canvas.

Centered viewport.

Soft gray background.

Subtle grid.

Optional rulers.

Zoom controls.

Pan support.

---

# Selection

Selected elements display:

Blue outline.

Resize handles.

Margin indicators.

Padding indicators.

Distance guides.

---

# Drag and Drop

Dragging should feel physical.

Show:

Drop indicator.

Insertion line.

Container highlight.

Animated placement.

No jumping.

---

# Layers Panel

Nested tree.

Collapse.

Expand.

Lock.

Hide.

Rename.

Drag reorder.

Search.

---

# Property Panel

Grouped sections.

Accordion layout.

Searchable properties.

Favorites.

Reset buttons.

Responsive overrides.

---

# Empty States

Illustration.

Headline.

Helpful description.

Primary action.

Never leave blank screens.

---

# Loading States

Skeleton loaders.

Avoid spinners where possible.

Progressive loading.

---

# Notifications

Toast notifications.

Top right.

Auto dismiss.

Pause on hover.

Action button when needed.

---

# Keyboard Shortcuts

The complete shortcut map is defined in [keyboard-shortcuts.md](./keyboard-shortcuts.md).

Everything important should have shortcuts.

Undo

Redo

Duplicate

Delete

Copy

Paste

Zoom

Save

Publish

Search

---

# Responsive Design

Desktop

Tablet

Mobile

Every component supports responsive overrides.

---

# Accessibility

Keyboard first.

WCAG AA.

Visible focus states.

Screen reader support.

Proper ARIA.

High contrast support.

Reduced motion support.

---

# Dark Mode

Dark mode is a first-class feature.

Not an afterthought.

Every component must support:

Light

Dark

System

---

# AI Experience

AI should feel like a creative assistant.

Never interrupt.

Never overwhelm.

Suggestions should appear naturally.

Examples:

Improve spacing

Increase conversions

Simplify layout

Improve accessibility

Improve hierarchy

---

# Overall Feeling

When someone opens Checkout Studio for the first time they should think:

"This feels like Framer built a checkout builder."

That emotional reaction is one of the primary design goals of the product.
