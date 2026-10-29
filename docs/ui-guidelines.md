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

The Assets panel is a grid rather than a list, because what identifies a picture
is the picture. Columns come from the panel's measured width rather than a
breakpoint — the panel is a width the reader is dragging — and a cell never goes
below 96px, which is where a logo stops being a logo and becomes a smudge.

It virtualizes, like Layers: a thousand assets is the target in
[phases.md](./phases.md), and a thousand thumbnails in the DOM is a thousand
image requests. The grid carries its row and column counts for a screen reader,
so what is announced is the size of the library rather than the size of the
window onto it. One tab stop for the whole grid, with the arrows moving within
it, and focus stops at the ends rather than wrapping.

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

# Theme panel

In the left sidebar, per [theme-system.md](./theme-system.md) § Editor
Integration. Every section the specification lists is built: Brand, Colors,
Typography, Spacing, Radius, Shadows, Components and Dark mode.

An accordion, not a list. A theme holds more decisions than fit on a screen and
they are not decisions made together — choosing a brand colour and tuning the
elevation ramp are separate sittings. Several sections may be open at once,
because comparing a radius against a shadow is a real thing to want. Each
section is handed the theme rather than reading it from context, so the check
for whether a theme exists happens once and a section can be rendered in a test
without a provider around it.

**Brand holds one colour; Colors holds the rest.** The theme has thirteen
semantic colours and Brand owns `primary`, because the whole section is built
around deriving from it. The other twelve are the Colors section. They were
unreachable before it existed — overridable for dark mode and not settable for
light, which is the wrong way round, since dark mode is a sparse layer above a
light theme nobody could edit.

**Colors and Dark mode are the same list.** Same keys, same order, same labels,
from one list both import. A person who has just set a surface colour and then
opens Dark mode to invert it finds that surface in the same position. That is
worth more than grouping the twelve into surfaces, text, borders and status — a
grouping that would then disagree with the section directly below it. Two of
the twelve, the label on the brand colour and the focus ring, are also derived
from the brand colour, and the section says that picking a brand colour again
replaces whatever was set there rather than hiding the two controls.

**A brand colour too pale to focus with is said so.** A focus ring is a
non-text indicator and needs 3:1, and the derived ring is opaque, so the panel
is looking at the best ring that colour can give. Whether it clears the
threshold depends on the page background, which the derivation is not given and
the panel is — so the panel measures the pair it holds. A background written as
`oklch(...)` or as a reference cannot be measured, and an unmeasurable pair is
not a failing one: nothing is claimed rather than a warning shown on a guess.
This is a separate sentence from the unreadable-label warning, because they are
separate problems and a colour can have one without the other.

**One colour, and what it implies.** The picker is the brand colour. The scale
and the derived roles are shown beneath it, because a person choosing a brand
colour is really choosing eleven of them and a button state they will not
otherwise see until they publish.

**A colour that is not a hex is typed, not picked.** `themeColors` holds a
string, and `oklch(...)`, a named colour and a reference to another token are
all valid ones. None fits in a colour picker, and opening the picker at black
would tell the merchant their brand colour is black — so those are edited in a
text field, committed when it is left rather than on each keystroke. Nothing is
derived from them: the scale says it needs a hex, and the stored roles keep the
values they already had. The inspector answers the same question the same way.

**Live before saved.** An edit reaches the canvas at once and is written a few
seconds later, on the same debounce as a document edit. The status says which
of the two it is, and says it exactly — "unsaved" contains "saved", which is
enough to make a careless check agree with itself.

**What is shown is not all that is kept.** The derivation produces five roles
and `themeColors` holds two: a button's hover belongs to a component slot that
a plugin defines, and nothing models a selection colour. The three that cannot
be stored are shown and marked, which is more honest than deriving them
silently or pretending they were never worked out.

**Changing the brand colour recomputes the stored roles, except the chosen
ones.** A role set by hand in Colors is marked in `theme.manual` and is never
recomputed, which is what makes picking a brand colour a safe thing to do
twice. The derived list still shows what a new colour implies for a chosen
role, marked as chosen: the implication is real, the theme has simply been told
not to follow it, and hiding the row would make the brand colour look as though
it had no opinion.

**Editing a colour marks it as chosen, and un-marking is a real action.** Every
edit in Colors records its token path, so the record is true of all twelve even
though only the two derived roles are read today. The two derived roles say
which they are — "worked out from the brand colour" or "set by hand" — and a
chosen one offers "Use derived", which clears the mark and writes what the
brand colour implies. Clearing the mark alone would leave the hand-set colour
in place until somebody happened to pick a brand colour again, so the result is
shown rather than promised. It is not offered when the brand colour is not a
hex, because then there is nothing to work the value out from.

**The base unit is the spacing decision, and it rewrites the scale.** The
renderer emits `--ck-space-N` from `spacing.scale` and never reads
`spacing.base`, so a base written on its own would save a number and move
nothing on the canvas. It is not a vestigial field, though: the default theme's
scale is its base times a fixed ladder, exactly, so the base is the unit the
scale was designed around. Changing it derives the scale again — one decision,
twelve values, the same shape as one brand colour standing for eleven. The
ladder lives in the design system beside the colour derivation, because it is a
design decision rather than a piece of the panel. Density is a separate
control: it multiplies the finished scale per breakpoint at render time, which
is a different route to the canvas.

**The body size is the typographic decision, and it rewrites every step.**
The same shape as the spacing base: a fixed ladder of multipliers, measured
from the default theme, scaled by one number. A ladder rather than a modular
ratio because the default theme's own ratios run from 1.08 to 1.33 — a hand-
tuned scale beats a geometric one, since small sizes need to stay apart to be
distinguishable and large ones can jump — so no single ratio could reproduce
the scale the panel was handed, and the first drag of a ratio control would
rewrite all nine sizes into a shape nobody chose.

Only `fontSize` is derived. Line height, letter spacing, weight and transform
are per-step decisions a ladder has nothing to say about: the default theme's
display line is deliberately tighter than its caption, and a resize that
flattened them would throw that away. The scale is previewed at its own sizes,
because a column of numbers tells you the scale is there and not whether it
works. Fluid scale is typography's density — it multiplies every size per
breakpoint at render time.

**Only fonts that need no file are offered.** `FontDefinition.source` has three
values and one of them works today. A Google family is meant to be fetched into
our own asset storage and served from our origin; until the asset pipeline has
ingested it there is no file, and the renderer says so — `planFonts` raises
`not-self-hosted` and falls back to the stack. A custom family needs an
`assetId`, which is the same pipeline. Offering either would write a theme whose
font silently never loads, on the very screen where it was chosen. A family the
panel does not offer, including one a theme already holds, is shown as written
and named for what it is waiting on. Choosing a family writes its fallback
stack with it: a serif left on a sans stack renders as a sans on exactly the
machines the stack exists for.

**Radius offers the three a person chooses.** `none` is `0` and `full` is
`9999px` — not values somebody picked but what "square" and "round" mean, so
they are named and not offered. Both are shown, so the vocabulary reads whole.

**Shadows put the two parts that carry elevation on sliders** — the drop and
the blur — and write back everything they do not show. A spread, a horizontal
offset and `inset` are parsed and preserved, rather than dropped by a control
with nowhere to put them. The colour is shown and not edited: a shadow is
mostly its alpha, `ColorPicker` takes a hex, and no theme token carries an
alpha, so an alpha control here would be one this panel invented.

**Components lists itself from the registry.** Nothing in the panel names a
component. A plugin that registers a theme slot appears because it registered
one, and a second product shipping a different set needs no change to the
panel — which is the whole of what plugin-first means. The specification lists
Buttons, Inputs, Cards and Payment Element under this heading; none of them
registers a slot yet, so none is shown, and they arrive when they do.

A slot's fields are **declared, not inferred**. A slot registers a Zod schema,
which says what a value is and not what a person adjusting it should see:
`z.string()` could be a colour, a length or a CSS keyword, and a panel guessing
from the type offers a text box for all three. So a slot declares its fields
and the panel renders them with the inspector's own controls — the editor
already knows how to draw a dimension with a unit picker, and drawing one a
second way here would be two panels disagreeing about what a length is. A slot
value can therefore hold a token reference too, since it is the inspector's
control.

A field the theme has not set shows the **plugin's own default**, because that
is what the renderer resolves: it spreads the theme's values over the plugin's
defaults. Putting a value back **removes it** rather than writing the default
in — writing it in would freeze today's default into the theme and leave a
later one unreachable.

**Dark mode is an override layer, not a second theme.** Everything the layer
does not mention is inherited from the light theme, and the sparseness is the
point — a dark layer that grows to the size of a full theme means the semantic
layer is wrong. So each colour reads as inherited until somebody overrides it,
an override is seeded from the light value it was showing, and inheriting again
**removes** the override rather than writing the light value back. Writing it
back would leave the layer one key larger, claiming a decision nobody made, and
the next change to the light colour would no longer reach dark mode. When the
last colour goes the group goes with it, and when the last group goes so does
the layer: an empty `{ colors: {} }` and no layer at all mean the same thing to
the renderer, and only one of them reads as "this theme has a dark layer".

Colours are editable here; the other groups a layer may hold are named at the
foot of the section rather than hidden, so a merchant whose dark shadows differ
can tell. The default theme's do, because a shadow is nearly invisible on a
dark surface.

**When dark mode applies is a page setting, not a theme value.** The same theme
published twice may follow the visitor on one page and be forced light on
another, so it lives in `settings` — the specification says so in as many
words. It is surfaced in the Dark mode section, beside the values it governs,
only because there is no settings panel yet; when one exists the control moves
there rather than being copied. With no page open it says where the choice
lives rather than appearing dead.

The renderer reads the setting itself, so a published page honours it without
anything being passed. The `colorMode` prop still wins, because editor preview
has to be able to show either mode without editing the page — a preview locked
to a merchant's forced light theme would make dark mode impossible to look at
before publishing.

**A value a control cannot hold is shown as the text it is.** A radius in per
cent, a shadow written as a comma-separated list, a body size in `rem`, a size
past the ends of its slider, a brand colour written as `oklch(...)` — each is
valid, none fits the control beside it, and clamping or re-deriving one would
silently change a decision the merchant made on a screen they opened to look
at. Out of range is not the same as unparseable, and both get this answer. It
is the same answer throughout the panel and the inspector.

Reading one takes care: `Number.parseFloat("1rem")` is `1`, not `NaN`, so the
obvious check passes and a body size in `rem` becomes a one-pixel base that
derives the whole type scale from nothing. The unit is matched rather than
discarded, in one parser the sections share.

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

## Gradients

A picture of the gradient, then the parts that produce it: a kind, a
direction, and a row per colour with the position it sits at.

**The preview is not decoration.** `linear-gradient(90deg, #ff0000, #0000ff
60%)` is a sentence nobody reads as a colour. Every other control in this panel
shows the value it holds — a swatch, a number, four sides — and a gradient
shown only as its text would be the one property a merchant had to publish to
see.

It is painted through the schema's own CSS guard. The value lands in an inline
style, so one carrying a semicolon could end that declaration and begin
another; a preview that stays blank is a better outcome than a panel rendering
something nobody wrote.

**Two colours is the floor.** CSS wants two and so does the idea. Removing is
refused at two rather than hidden, because a disabled control that says why is
a smaller surprise than a row that loses its last button without explanation.

Adding a colour repeats the last one, so the new stop lands somewhere visible
rather than as a transparent gap somebody has to go looking for.

An emptied colour is held, not written. An empty stop makes the whole value
unparseable, and the control would collapse to a text box while somebody was
halfway through retyping a colour.

A conic gradient, two gradients layered together, a `var()` standing in for the
lot — all real values, none of them a direction and a list. They are shown as
the text they are.

## Markup

A code box: monospaced, eight rows, with spellcheck, autocorrect and
autocapitalise all turned off — all three treat `<div>` as a typo.

**It commits when it is left, not as it is typed.** What the document holds is
the structure the text parses to, and the box shows that structure serialised
back. Reporting every keystroke means parsing every keystroke, so typing `<`
stores a tree with nothing in it, which serialises to an empty string, which
lands back in the box and deletes the character just typed. Nothing could ever
be written.

**The editor cannot tell HTML from CSS, and should not.** Both register as
`control: "markup"` and nothing in a property definition says which is which.
The grammar belongs to the plugin that owns the component, so the application
looks up the converter and hands the editor text. Running a stylesheet through
an HTML parser would strip it to nothing and report nonsense.

## Notes under a control

What the application wants said about a value, beneath the control it belongs
to, announced when it appears — the words answer something that was just
typed, by which time the reader has moved on.

The markup properties are why this exists. Their help text promises that
"scripts, styles, frames and form fields are removed, and the editor lists what
it took out", and a filter that silently deletes half of what somebody pasted
teaches them the feature is broken. One that says `script, onclick` teaches
them what the rule is.

The note describes an edit, not the document, so it lasts until the next one.

## Borders

A width, a style and a colour: the width beside the style picker, the colour
under them.

**`none` is a style, not a missing value.** This is where a border differs
from a shadow — `box-shadow: none` is the absence of a shadow and there is
nothing for a control to show, while `border: none` is a border whose style is
none, the same word in the same place in the same shorthand. So it lives in
the picker, and turning a border on means choosing `Solid` rather than knowing
to delete a word.

Choosing a style when there is no width gives it `1px`. CSS would otherwise
fall back to `medium`, which is three pixels and which nobody asked for.

Choosing `None` writes `none` on its own. A width and a colour beside a style
of none describe a border that is not drawn, and keeping them means the
document carries a measurement for something invisible — which reads, the next
time anybody opens it, as a border that has lost its style. The boxes stay on
screen holding what they held, so turning it back on costs one click.

The order parts are written in does not matter. `1px solid red`, `solid 1px
red` and `red 1px solid` are the same border to a browser, so each part is
recognised by what it is rather than by where it sits.

CSS has nine styles; five are offered. `groove`, `ridge`, `inset` and `outset`
draw a bevel no interface designed in the last fifteen years asks for, and
`hidden` differs from `none` only inside a collapsed table. A value already
holding one keeps it and can return to it.

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
