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

Appears above selection.

Contains

Duplicate

Delete

Move

Lock

Visibility

Responsive

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
