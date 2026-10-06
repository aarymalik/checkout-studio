# Checkout Studio Editor Behavior Specification

**Version:** 1.0

**Status:** Editor UX & Interaction Specification

---

# Overview

The editor must feel fast, intuitive, and predictable.

Every interaction should provide immediate visual feedback.

Users should never wonder:

- What is selected?
- Where will an element drop?
- Why can't I perform an action?

The editor should always communicate its current state.

---

# Design Principles

The editor must feel:

- Instant
- Smooth
- Precise
- Forgiving
- Consistent

Every interaction should require as few clicks as possible.

---

# Canvas

The canvas is the primary workspace.

Supports:

- Infinite scrolling
- Zoom
- Pan
- Multi-device preview
- Snap to grid
- Guides
- Rulers

---

# Default Canvas

Desktop

1440px

Tablet

768px

Mobile

390px

Canvas background

Neutral Gray

---

# Selection

Supports

Single Selection

Multi Selection

Box Selection

Keyboard Selection

Nested Selection

---

# Selection Indicators

Selected components display

- Blue outline
- Resize handles
- Toolbar
- Component label

Hovered components display

- Light outline

Locked components display

- Lock icon

Hidden components display

- Eye-off icon

---

# Double Click

Double click

↓

Enter edit mode

Examples

Text

↓

Edit text

Image

↓

Replace image

Button

↓

Edit label

---

# Escape Key

Esc

↓

Exit edit mode

↓

Clear selection

---

# Right Click

Context Menu

Contains

Cut

Copy

Paste

Duplicate

Delete

Lock

Hide

Rename

Bring Forward

Send Backward

Wrap

Ungroup

---

# Drag & Drop

Drag from

Component Library

↓

Canvas

↓

Insert

Supports

Nested containers

Columns

Stacks

Grids

Forms

---

# Drop Indicators

Display

Insertion Line

Drop Zone Highlight

Position Hint

Spacing Preview

Never guess insertion location.

---

# Smart Insertion

Dragging over

Container

↓

Insert inside

Dragging between

Sections

↓

Insert after

---

# Drag Preview

Dragged component follows cursor.

Opacity

80%

Shadow

Enabled

Scale

1.02

---

# Snapping

Supports

Parent edges

Sibling edges

Center

Grid

Custom guides

---

# Alignment Guides

Show guides when aligned with

Top

Bottom

Center

Left

Right

Spacing

---

# Grid

Optional

8px base grid

Snap toggle

On / Off

---

# Resize

Resize handles appear for

Images

Containers

Columns

Videos

Spacing

Resize should update live.

---

# Rotation

Future feature.

Not required in V1.

---

# Keyboard Shortcuts

Undo

Ctrl + Z

Redo

Ctrl + Shift + Z

Duplicate

Ctrl + D

Delete

Delete

Copy

Ctrl + C

Paste

Ctrl + V

Cut

Ctrl + X

Select All

Ctrl + A

Selects every sibling of the current selection, or every top-level section when nothing is selected.

Save

Ctrl + S

Preview

Ctrl + Alt + P

(Not Ctrl + Shift + P, which Firefox reserves for a private window.)

Publish

Ctrl + Shift + Enter

Command Palette

Ctrl + K

The complete shortcut map, scope model, and customization rules are defined in [keyboard-shortcuts.md](./keyboard-shortcuts.md).

---

# Multi Selection

Shift + Click

adds selection.

Drag selection box

selects multiple nodes.

---

# Layer Panel

Supports

Collapse

Expand

Drag reorder

Lock

Hide

Rename

Search

## Virtualization

The panel renders the rows in view plus a margin, and replaces the rest with
spacer height so the scrollbar reports the length of the document rather than
the length of the window. Rows are a fixed height, which is what makes the
window arithmetic a division instead of a measured layout pass.

A panel that virtualizes owns its scroller. It has to read the scroll offset and
the visible height from the element the user is actually scrolling, so the
surrounding panel hands the scrolling over rather than nesting one scroller
inside another.

## Structure

The panel is a tree to a screen reader and a flat list to the DOM: `role="tree"`
with `aria-level` on each row carries the depth that indentation shows sighted
users. A nested list would say the same thing and could not be windowed.

One tab stop for the whole tree, with `aria-activedescendant` naming the current
row. Two thousand rows are not two thousand tab stops.

The page root is not listed. It cannot be selected on the canvas, and a row that
cannot be chosen teaches people to stop trying.

## Expansion

The panel stores what the user **collapsed**, not what is expanded. A new page,
or a container added to the open one, is expanded without anything having to
notice it appeared — and a seed taken once from the document goes stale the
moment the document is replaced.

Selecting a node anywhere expands its ancestors first. Scrolling to a row inside
a collapsed parent scrolls to a row that was never rendered.

## Keyboard

| Key         | Behaviour                                           |
| ----------- | --------------------------------------------------- |
| `↑` / `↓`   | Move through the visible rows, selecting as it goes |
| `→`         | Expand the current row                              |
| `←`         | Collapse the current row                            |
| `⌥↑` / `⌥↓` | Move the node earlier or later                      |
| `⌥→`        | Make the node a child of the sibling above it       |
| `⌥←`        | Lift the node out of its parent                     |
| `F2`        | Rename in place                                     |

`↑` and `↓` step through the rows on screen rather than through siblings, so
what the user sees is what moves. `⌥↑` at the top of a container lifts the node
out to sit before its parent, and `⌥↓` past the last sibling drops it after —
which is how a node escapes a container without a pointer.

Every one of these produces a **move**: a parent and an index. Not a swap, not a
shift, so undo, autosave and the renderer all see one kind of change.

Enter is not bound here. [keyboard-shortcuts.md](./keyboard-shortcuts.md)
reserves it for walking the tree, and a second meaning in this panel would
collide with it.

A locked row can still be focused and selected. Locking stops a node being
edited, not being looked at — and a user has to reach a locked row to unlock it.

## Hide and lock

The eye and the padlock appear on the hovered row and stay visible once used. A
column of them down every row is noise.

Hiding a node dims its descendants but does not mark them hidden: the ancestor's
row says what was switched off, and repeating it down the subtree would suggest
nine decisions where there was one.

## Rename

`F2`, or a double click on the label. The field opens with the text selected,
because a rename almost always replaces the name rather than appending to it.
Enter and blur commit, Escape abandons, and focus returns to the tree so the
keyboard keeps working.

Clearing the name commits it as empty, which drops the custom name and returns
the row to the component's own — `checkout.order-summary` reads as "Order
summary".

## Search

The same fuzzy matcher as the command palette, so `ordsum` finds the order
summary in both places. A match keeps its ancestors: a row shown without the
chain above it is a row with no context.

---

# Breadcrumb Navigation

Display

Root

↓

Section

↓

Container

↓

Button

Allows quick parent selection.

---

# Hover Behavior

Hovered node displays

Component Name

Dimensions

Quick actions

---

# Inline Toolbar

Appears above selection, and below it when there is no room above.

Contains

Duplicate

Delete

Move

Lock

Visibility

Responsive

**As built.** Five of the six. Every button runs a registered command and
nothing else, so the keystroke, the palette, a context menu and the toolbar are
four ways to reach one definition — and the disabled states are the commands'
answers rather than the toolbar's opinion. A locked node offers no Move and no
Delete because `arrange.move-*` and `edit.delete` report themselves unavailable,
which is the same answer the keyboard gets.

Move is the pair of reordering steps, `⌘↑` and `⌘↓`. Dragging a component to
move it arrives with drag and drop in Phase 8.

**Responsive is not built.** Responsive overrides are property editing, which
phases.md puts in Phase 12 and names explicitly as out of scope for Phase 7, so
there is nothing for the button to open. Switching which breakpoint is being
edited already exists in the top toolbar, where it applies to the page rather
than to one node — a sixth button here would either do nothing or duplicate
that one. It belongs with the overrides it would edit.

A WAI-ARIA toolbar: one tab stop for the group with the arrow keys moving
inside it, rather than six tab stops per selection. Unavailable buttons carry
`aria-disabled` rather than `disabled`, so they stay focusable — the arrow keys
would otherwise dead-end on the first unavailable one, and a control that is
simply absent from assistive technology cannot be discovered and asked about.

---

# Component Badges

Show

Dynamic Data

Visibility Rules

Animations

Responsive Overrides

Validation

---

# Editing Text

Single click

↓

Select component

Double click

↓

Edit text

Ctrl + Enter

↓

Finish editing

---

# Empty Containers

Show

Drop Here

placeholder.

---

# Canvas Zoom

Mouse Wheel + Ctrl

or

Trackpad Pinch

Range

10%

to

400%

Default

100%

---

# Canvas Pan

Middle Mouse

or

Space + Drag

---

# Device Switching

Desktop

Tablet

Mobile

Switch instantly.

Preserve zoom.

---

# Responsive Editing

Styles only affect

Active breakpoint

unless user chooses

Apply to All

---

# Property Changes

Changes apply immediately.

Undoable.

Autosaved.

---

# History

Every user action

↓

History Entry

Grouped actions

count as one step.

---

# Clipboard

Copy

Paste

Duplicate

Preserve

Styles

Children

Validation

Visibility

---

# Delete

Delete key

↓

Remove component

Confirmation only for

Sections

Forms

Large groups

---

# Lock

Locked components

Cannot move

Cannot resize

Cannot delete

Remain selectable.

---

# Hide

Hidden components

Remain in Layers

Not rendered

Can be restored

---

# Rename

Every node

can have

Display Name

Used only in Layers.

---

# Search

Global search

Find

Component

Page

Layer

Asset

---

# Auto Scroll

Dragging near canvas edge

↓

Auto scroll

Smooth acceleration.

---

# Undo Behavior

Undo restores

Selection

Position

Properties

History

Viewport unchanged.

---

# Autosave Indicator

Top bar

States

Saved

Saving...

Unsaved Changes

Error

---

# Publish Indicator

Draft

Published

Modified

Publishing...

Published

---

# Errors

Invalid actions

never crash editor.

Show toast notification.

---

# Empty States

Provide guidance.

Examples

"No components yet."

"Drag a Section here."

---

# Loading

Skeleton UI

Never blank screen.

---

# Performance

Direct manipulation — selection, hover, drag, typing, nudging, property edits — completes within

16ms

Compound operations — undo or redo of a large group, theme swap, breakpoint switch — complete within

50–100ms

Target

60 FPS

---

# Accessibility

Keyboard navigable.

Visible focus.

ARIA labels.

Screen reader support.

---

# Future Features

Comments

Collaboration

Presence

Version Compare

AI Layout Suggestions

Voice Commands

Design Tokens

---

# Editor Philosophy

The editor should disappear behind the user's workflow.

Users should focus on building beautiful checkout experiences, not learning the software.

Every interaction should feel deliberate, responsive, and polished.
