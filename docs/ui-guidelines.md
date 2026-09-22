# Checkout Studio UI & Interaction Guidelines

**Version:** 1.0

**Status:** UX & Interaction Specification

---

# Design Philosophy

Checkout Studio should feel:

- Fast
- Calm
- Precise
- Premium
- Predictable
- Minimal

The interface should disappear and let creators focus on building.

Every interaction must feel intentional.

---

# Core Principles

The editor should prioritize:

- Speed over decoration
- Consistency over novelty
- Simplicity over complexity
- Clarity over density

Never overwhelm the user.

---

# Visual Language

Inspired by:

- Figma
- Framer
- Linear
- Raycast
- Notion
- Vercel Dashboard

Not inspired by:

- WordPress builders
- Legacy page builders
- Bootstrap admin templates

---

# Studio Layout

```
+--------------------------------------------------------------+
| Top Toolbar                                                  |
+------------+----------------------------------+--------------+
|            |                                  |              |
|            |                                  |              |
|  Left      |           Canvas                 | Right        |
|  Sidebar   |                                  | Inspector    |
|            |                                  |              |
|            |                                  |              |
+------------+----------------------------------+--------------+
| Bottom Status Bar                                           |
+--------------------------------------------------------------+
```

---

# Top Toolbar

Contains:

- Project Name
- Undo
- Redo
- Device Switcher
- Zoom
- Preview
- Publish
- User Menu

Height

64px

Always fixed.

---

# Left Sidebar

Width

320px

Resizable

Minimum

260px

Maximum

420px

Contains

- Components
- Layers
- Pages
- Assets
- Templates
- Theme

Collapsed width

64px

---

# Right Inspector

Width

340px

Resizable

Minimum

300px

Maximum

460px

Contains

The eleven accordion sections listed under **Inspector** below.

---

# Canvas

Infinite canvas.

Centered.

Supports:

Pan

Zoom

Multi-select

Snap guides

Drag overlays

Auto-scroll

Canvas background:

Neutral gray.

---

# Bottom Status Bar

Contains:

Zoom %

Selection

Warnings

Autosave status

Keyboard hints

---

# Selection

Selected elements show:

- 2px primary outline
- 8 resize handles
- Floating toolbar
- Component label

Selection animation:

150ms

---

# Hover

Hover states are subtle.

Never distracting.

Hover outline:

1px

Low opacity

Cursor changes appropriately.

---

# Resize Handles

Size

8px

Circular

Visible only when selected.

Snap while resizing.

---

# Drag & Drop

Dragged component:

- 80% opacity
- Shadow
- Scale 1.02
- No rotation

Matches the drag preview in [editor-behavior.md](./editor-behavior.md).

Drop targets:

- Blue insertion indicator
- Animated spacing preview
- Auto-expand containers

---

# Snap Guides

Show guides when aligned.

Support:

- Edges
- Centers
- Equal spacing

Guide color:

Primary Accent

Disappear immediately after release.

---

# Multi Selection

Shift + Click adds to the selection.

Cmd/Ctrl + Shift + Click toggles a node in or out of the selection.

Cmd/Ctrl + Click selects the deepest node under the cursor.

These match [keyboard-shortcuts.md](./keyboard-shortcuts.md).

Selection box supports:

Move

Align

Distribute

Group

---

# Floating Toolbar

Appears above selection.

Contains:

- Duplicate
- Delete
- Lock
- Hide
- Bring Forward
- Send Backward

Animated.

Auto hides.

---

# Context Menu

Right click opens:

Duplicate

Delete

Rename

Wrap

Ungroup

Copy

Paste

Lock

Hide

Always near cursor.

---

# Inspector

Properties grouped.

Example

```
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
```

Accordion based.

Only one expanded by default.

---

# Inputs

Rounded.

Consistent height.

Clear labels.

Helpful descriptions.

Inline validation.

Never use placeholder as label.

---

# Buttons

Large hit area.

Minimum height

40px

Hover

Elevation increase

Pressed

Scale 0.98

Disabled

Reduced opacity

---

# Animations

Fast.

Purposeful.

Never flashy.

Standard durations

150ms

180ms

220ms

Nothing animates faster than 150ms or slower than 220ms.

Default

150ms

Easing

ease-out

---

# Shadows

Use subtle shadows.

Never heavy.

Layer system

Level 1

Cards

Level 2

Dropdowns

Level 3

Dialogs

Level 4

Notifications

---

# Dialogs

Centered.

Blurred backdrop.

Escape closes.

Focus trapped.

Animated scale + fade.

---

# Panels

Resizable.

Remember width.

Smooth resize.

No layout jumps.

---

# Search

Instant.

Keyboard focused.

Supports fuzzy search.

Appears everywhere.

---

# Command Palette

Shortcut

Cmd + K

Supports:

Pages

Components

Actions

Commands

Settings

Templates

Plugins

---

# Keyboard Shortcuts

The complete shortcut map, scope model, and accessibility rules are defined in [keyboard-shortcuts.md](./keyboard-shortcuts.md).

Cmd + K

Command Palette

Cmd + Z

Undo

Cmd + Shift + Z

Redo

Cmd + D

Duplicate

Delete

Delete

Space

Pan

Shift

Multi-select

Arrow Keys

Nudge

Shift + Arrow

Large Nudge

---

# Zoom

Mouse wheel + Cmd

Trackpad pinch

Toolbar controls

Zoom range

10%

to

400%

Default

100%

---

# Auto Save

Runs silently.

Status shown:

Saving...

Saved

Last saved 2 seconds ago

Never interrupt editing.

---

# Notifications

Small.

Top-right.

Auto dismiss.

Never modal.

Types:

Success

Info

Warning

Error

---

# Empty States

Friendly.

Helpful.

Actionable.

Example

"No pages yet."

↓

Create your first checkout.

---

# Loading

Skeleton loaders.

Never spinners for page loads.

Buttons show inline loading.

---

# Accessibility

Keyboard first.

Visible focus.

Screen reader friendly.

ARIA labels.

High contrast support.

Reduced motion support.

---

# Responsive Preview

Three devices

Desktop

Tablet

Mobile

Switch instantly.

Canvas animates smoothly.

---

# Color Usage

Primary

Actions

Secondary

Neutral UI

Success

Green

Warning

Amber

Danger

Red

Information

Blue

Never overuse color.

---

# Icons

Use Lucide Icons.

Consistent stroke.

20px default.

Never mix icon sets.

---

# Typography

Inter

System fallback.

Consistent spacing.

Avoid more than:

6 font sizes on a single screen.

The type scale in [design-system.md](./design-system.md) has more steps than that; any one screen uses a subset.

---

# Motion Principles

Motion communicates.

Motion never decorates.

Every animation should answer:

What changed?

Where?

Why?

---

# Error Messages

Message rules and presentation by severity are defined in [error-handling.md](./error-handling.md).

Clear.

Actionable.

Never technical.

Example

✓

"Stripe isn't connected."

Instead of

"API Error 403"

---

# Publishing

Publish button always visible.

Primary action.

Shows:

Draft

Publishing

Published

Failed

---

# Performance Goals

Direct manipulation:

<16ms

Compound operations (large undo, theme swap, breakpoint switch):

<100ms

Selection:

Instant

Drag:

60 FPS

Zoom:

Smooth

Typing:

No lag

---

# Micro Interactions

Every interaction has feedback.

Hover

Selection

Drag

Drop

Resize

Publish

Autosave

Duplicate

Delete

Focus

Blur

These details create a premium experience.

---

# Engineering Principles

The UI should never surprise users.

Every action should feel immediate.

Every interaction should communicate confidence.

Great software feels invisible.

Checkout Studio should feel like a professional design tool, not a traditional website builder.
