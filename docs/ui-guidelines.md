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

# Dialogs

**As built.** A dialog is bounded at 90% of the window and its body scrolls
inside that. Without the bound a dialog taller than the window overflowed both
ends of it and neither could be reached: it is `fixed`, so the clipped top was
off screen and the bottom below the fold with nothing to scroll. The shortcut
reference is where it showed — forty shortcuts, of which about twenty-five
could be read and the rest never.

The header and the close button stay put while the body scrolls, so the way out
does not leave with the first screenful.

The body's gutter can be turned off for a dialog whose content is meant to
reach the edges, and the header keeps its padding either way. The command
palette used to switch the padding off for the whole dialog to get an
edge-to-edge search field, which took the title to the corner with it.

**One focus ring, unlayered, and that is the design.** reset.css is imported
after Tailwind, so an unlayered rule in it beats every utility whatever the
source order. That is what makes one ring for the whole product true: every
control carries `outline-none` to remove the browser's own, and the reset puts
ours back, and no component can drift. Button says so three lines above its own
`outline-none`.

It was moved into `@layer base` once, on the reading that beating
`outline-none` was a bug. It is the point. Layering it meant the utility won
and **no ring was drawn anywhere** — twenty-three controls, none of which
provides its own, every one of them silently unfocusable to look at. That
shipped.

The visual case photographing a focused button was written to catch it and
could not: two pixels around a button are about 540 of a full page's 990,000,
and the suite's `maxDiffPixelRatio` allows nearly 2,000. The ring was in the
baseline and could never be missed from it. The focused case is photographed
twice now — the page, and again cropped to the control, where the same 540
pixels are a tenth of the picture. Deleting the ring fails the crop.

The offset is a variable, so a control can pull the ring inside its own box
without fighting the cascade. The command palette's search field runs the full
width of the dialog, so a ring drawn outside it crosses the rounded corners as
a hard rectangle — which is what was reported. `--cs-focus-ring-offset: -2px`
keeps the one ring and moves it in.

**The ring's colour is declared on everything, not only on what is focused.**
`transition-colors` — which every control uses — animates `outline-color`
along with the rest. While the colour was declared only under
`:focus-visible`, focus _was_ a change of colour, from the initial
`currentColor`: on a focused primary button `outline-color` read
`rgb(255, 255, 255)` at the first frame and `rgb(79, 70, 229)` once it
settled, so for 150ms there was no ring at all on a white page. Declaring the
colour unconditionally leaves nothing to animate, and `:focus-visible` then
only turns the ring on.

No screenshot can watch this: the visual suite disables animations, which
fast-forwards every transition to its end, so the one frame that matters is
the one no picture holds. A test in the design system reads the stylesheet
instead.

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

## Reset

A property the node holds itself offers a reset. One it inherits does not —
resetting a value nobody changed is a button that does nothing, and a panel
where every row carries one says nothing about which rows have been touched.

Rendered, not revealed on hover. A control that appears only under the pointer
cannot be reached by a keyboard or on a touch screen, so it is quiet rather
than hidden: caption-sized and muted, under the control it belongs to.

Its accessible name carries the property. Eleven buttons called "Reset" are
eleven buttons a screen reader cannot tell apart.

Reset **deletes** the node's value; it does not write the default back. The two
look identical on screen and mean different things — a written-back default
stops tracking the component, so a later change to that default, or to the
theme token it references, no longer reaches the node. What reset restores is
inheritance.

A property stored under more than one key is cleared under all of them. One
padding is up to five keys, and a reset that removed only the shorthand would
leave four longhands behind and read as a button that does nothing.

## Breakpoints

The panel edits the breakpoint the canvas is showing, and shows what is in
force there: the override at this breakpoint, else the next wider one, else
the component's default. That is the order a browser applies them in — desktop
is the base and the narrower breakpoints are `max-width` queries — and a panel
that resolved it differently would be showing a number the page does not use.

Only a property that asked to be responsive is per-breakpoint. A prop never
can be, since the document stores overrides for styles only, and a style whose
definition did not ask is edited at the base wherever the canvas happens to
be. Neither is described as having an override.

**A property set at this breakpoint is marked, and only then.** The mark and
the reset are the same row, because they are the same fact: this breakpoint
holds something of its own.

Reset means the narrower thing here. At the base it puts the component's
default back; at tablet it removes the override and the desktop value returns.
The button says which — "Reset" against "Remove" — because a button promising
the default while restoring the desktop value would be describing something
that did not happen.

A property showing an inherited value has nothing to reset at this breakpoint.
Offering it would suggest the value belongs here when it does not.

## Shadows

A shadow is a handful of numbers that belong together — across, down, blur, a
colour — so it is drawn the way four sides are, as a row of small boxes with
the colour beneath.

**The control shows the parts the value has.** A box shadow may carry a spread
and the word `inset`; a text shadow may carry neither, and writing one into a
text shadow produces a declaration the browser drops. Both register as
`control: "shadow"` and nothing in a property definition says which is which,
so rather than guess from the key — which the editor does not know and must
not learn — what is there is what is shown. Nothing it writes is ever invalid
for the property it came from.

The cost is stated rather than hidden: a box shadow with no spread cannot be
given one here. That needs the definition to say which kind of shadow it is.

`none`, and a list of two shadows separated by a comma, are not things four
boxes describe. They are shown as the text they are.

A colour the picker cannot hold is edited as text, and almost every shadow
colour is one of those: the theme's own are `rgba(10, 10, 10, 0.08)` and the
rest, because a shadow is nearly always part transparent. A picker shown over
one would draw a black swatch for a colour that is neither black nor opaque.

## Several components at once

The panel offers **only what every selected component has**. A Heading and a
Button both have a font size and the panel can set both at once; only the
Heading has a level, and a control that wrote one to a Button would be writing
a prop the component does not read.

Properties are the same property when their key, target _and_ control agree.
Two components may both call something `size` and mean a number in one and a
length in the other — one editor over two shapes would write whichever it drew
into both.

**A value they do not share reads "Mixed", never the first one's.** Showing the
first is the tempting bug: the panel reads as though they all agreed, and the
first keystroke anywhere else makes that true. A key one of them does not hold
at all counts as a disagreement.

Where "Mixed" does not fit, it is said once beside the label and the fields
carry a dash. Four side boxes are 56 pixels wide and render the word as "Mi›",
which reads as a glitch rather than a value.

An edit reaches every selected component, as **one** entry in history. Several
nodes is several calls for a prop, and an undo that put back one of four would
be a document nobody asked for.

Apply-to-all is not offered for a mixed value: "the same everywhere" needs an
"it", and the first node's value is not the selection's.

## Search

A field at the top of the panel, always. `⌘F` focuses it and selects what is
there, because pressing it again means another search and the first one should
not have to be deleted first. Escape empties it rather than leaving a filter
nobody is looking at applied to the panel behind it.

`reserved.ts` already carves this panel out of the browser's find: both the
inspector and the layers panel are long lists with a search field of their own,
and in both a person pressing `⌘F` means "find in this list".

Matching is the fuzzy matcher the command palette and the layers panel use, so
one search is learned once. A **group** matches too: typing "typo" means
Typography, and no label in it contains those letters.

**Results are a flat list, not the accordion.** One section open at a time is
right for browsing eleven of them and wrong for reading an answer — a search
that put its own matches behind closed headers would be asking the question
twice. Each run is labelled with the group it came from, because "Colour"
means something different under Typography than under Background.

Nothing is reordered. The palette sorts by score; this does not, because a
panel that rearranged itself while somebody typed would make them hunt for a
control they had already found.

## Apply to all breakpoints

`⌘↵`, from inside the field. docs/keyboard-shortcuts.md states the need in one
line: "I set this on desktop and now I have to do it twice more."

It writes the base and removes every override. Writing the same value into all
three instead would look identical today and rot tomorrow, because a later
change to the desktop value would no longer reach the other two — each would
be holding a copy. One value at the base is what "the same everywhere" is.

All of it is one entry in history. It clears three breakpoints and writes one,
and an undo that put back a third of that would be worse than no undo.

What it applies is the value **in effect**, so for a side the sides nobody
typed come across as the theme references they already were. The property goes
on following the theme; what it stops following is the component's own
default, which the node now holds a value instead of.

It is offered only where there is something to apply. A prop is one value
already, and so is a style that never asked to be responsive.

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

Default height

40px

Dense toolbars may use 36px, and nothing goes below it. A 32px control is
comfortable with a mouse and not with a thumb; WCAG 2.5.8 sets the floor at
24px, and this sits well clear of it while staying legible in a crowded
toolbar.

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

Indigo

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
