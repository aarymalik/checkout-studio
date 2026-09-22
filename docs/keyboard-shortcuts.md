# Checkout Studio Keyboard Shortcuts Specification

**Version:** 1.0

**Status:** Input & Command Binding Architecture

---

# Purpose

Keyboard shortcuts are what separate a tool from an application.

In a professional editor, the mouse is for pointing and the keyboard is for working. A user who has learned the shortcuts should be able to build an entire checkout without moving their hand to the trackpad more than a handful of times.

This document defines:

- The complete shortcut map for Checkout Studio.
- The architecture that resolves a keystroke into a command.
- How scopes prevent shortcuts from firing in the wrong context.
- How plugins register shortcuts without breaking core bindings.
- How shortcuts remain fully accessible to keyboard-only and screen reader users.

Shortcuts are not a convenience layer bolted onto the UI.

They are the primary interface for expert users.

---

# Overview

Every shortcut in Checkout Studio resolves to a **Command**.

Commands are the single unit of user intent in the editor, shared by four surfaces:

```
              ┌─────────────────┐
              │    COMMAND      │
              │  id, title,     │
              │  handler,       │
              │  availability   │
              └────────┬────────┘
                       │
      ┌────────┬───────┼───────┬─────────┐
      ▼        ▼       ▼       ▼         ▼
  Keyboard  Command  Toolbar  Context  Plugin
  Shortcut  Palette  Button   Menu     API
```

A feature that has a toolbar button but no command is a bug.

A command that cannot be reached from the palette is a bug.

This is the same command model described in [plugin-api.md](./plugin-api.md).

---

# Architecture

```
                    Physical keystroke
                            │
                            ▼
                  ┌──────────────────┐
                  │  Keyboard Layer  │
                  │  (window level)  │
                  └────────┬─────────┘
                           │
                           ▼
                  Text input guard ──── in a field? ──▶ pass through
                           │
                           ▼
                  Platform normalization
                  (Cmd ⇄ Ctrl, layout independence)
                           │
                           ▼
                  Chord buffer
                  (multi-stroke sequences)
                           │
                           ▼
                  ┌──────────────────┐
                  │  Keymap Registry │
                  │  binding lookup  │
                  └────────┬─────────┘
                           │
                           ▼
                  Scope resolution
                  (most specific active scope wins)
                           │
                           ▼
                  Availability check
                  (can this command run right now?)
                           │
                           ▼
                  Command dispatch
                           │
                           ▼
                  Editor action → state → history → render
```

Every stage can decline. A declined keystroke falls through to the browser.

---

# Design Principles

**One keystroke, one command, one context.**

A binding is unambiguous within its scope. Ambiguity is a registration error, caught at startup.

**Never break the platform.**

Browser and OS shortcuts users depend on — `⌘T`, `⌘W`, `⌘L`, `⌘R`, `⌘⇧T`, `F5`, `⌘Q` — are never overridden.

**Match the tools users already know.**

Figma, Framer, Linear, and VS Code have taught a generation of users what these keys mean. We do not innovate here. Familiarity is the feature.

**Discoverable, not memorized.**

Every shortcut appears next to its command in menus, tooltips, and the palette. Nothing is hidden knowledge.

**Text input always wins.**

While a user is typing, the editor's shortcuts do not exist, with a small documented exception list.

**Scope over global.**

A shortcut registered globally when it should be canvas-scoped will eventually fire at the wrong moment. Default to the narrowest scope that works.

**Layout independent.**

Bindings resolve on physical key position (`KeyD`), not on the produced character, so AZERTY and Dvorak users get the same muscle memory.

**Every shortcut is undoable.**

If a keystroke changes the document, it produces exactly one history entry.

---

# Notation

This document uses macOS symbols. The Windows and Linux equivalents are automatic.

| Symbol | macOS   | Windows / Linux |
| ------ | ------- | --------------- |
| `⌘`    | Command | Ctrl            |
| `⌥`    | Option  | Alt             |
| `⇧`    | Shift   | Shift           |
| `⌃`    | Control | Ctrl            |
| `⌫`    | Delete  | Backspace       |
| `↵`    | Return  | Enter           |

The primary modifier is written `⌘` throughout and is called **Mod** in code.

```ts
// Authored once, correct on every platform.
{ key: "KeyD", mod: true }   →   ⌘D on macOS, Ctrl+D on Windows
```

`⌃` (literal Control) is used only where macOS and Windows genuinely differ, and is avoided wherever possible.

---

# Scopes

A scope is an activation context. Bindings only fire when their scope is active.

```
global
├── dashboard
└── studio
    ├── canvas
    │   ├── selection          (≥1 node selected)
    │   ├── multi-selection    (≥2 nodes selected)
    │   └── text-editing       (inline text edit active)
    ├── layers
    ├── inspector
    ├── library
    └── overlay
        ├── dialog
        ├── command-palette
        └── context-menu
```

Resolution rules

```
1. Collect all active scopes for the current focus.
2. Sort by specificity (deepest first).
3. First scope containing a matching binding wins.
4. If that command's availability check fails, stop — do not fall through.
```

Rule 4 matters, but only if a binding exists to match. Every canvas command that shadows a browser shortcut (`⌘D`, `⌘G`, `⌘[`, …) is therefore registered in the **`canvas`** scope with an availability check — not in `canvas.selection`, where it would not match at all with nothing selected. With nothing selected, `⌘D` matches, fails availability, and stops: nothing happens, and the browser's bookmark dialog does not open either.

## Overlay Scopes Are Exclusive

When a dialog, command palette, or context menu is open, **only** overlay scopes and a tiny global allowlist are active.

Allowlist while an overlay is open

```
Escape
Tab / ⇧Tab
Arrow keys
↵
```

This is what makes modal focus trapping reliable, per [ui-guidelines.md](./ui-guidelines.md).

---

# Text Input Guard

The most common shortcut bug in visual editors is a delete key eating a component while the user was editing a heading.

Guard rule

```
If the active element is
  <input>, <textarea>, [contenteditable],
  or the canvas is in text-editing scope

Then only the following are intercepted:

  Escape          exit editing
  ⌘↵              commit and exit — except in an inspector field,
                  where it commits AND applies to all breakpoints
  ⌘S              save now (otherwise the browser's "Save page" opens)
  ⌘Z / ⌘⇧Z        text-level undo, delegated to the text editor
  ⌘B / ⌘I / ⌘U    inline formatting (rich text only)
  ⌘K              insert link in rich text;
                  opens the command palette in every other field

Everything else passes through to the field.
```

`⌫`, `⌘D`, `⌘A`, and arrow keys operate on **text**, never on nodes, while a field has focus.

Exiting text editing restores the canvas scope on the next keystroke, never the same one.

---

# Complete Shortcut Map

## Global

| Shortcut     | Command                                  | Scope  |
| ------------ | ---------------------------------------- | ------ |
| `⌘K`         | Command Palette                          | global |
| `⌘/`         | Keyboard Shortcuts Reference             | global |
| `⌘S`         | Save now                                 | studio |
| `⌘⌥P`        | Preview                                  | studio |
| `⌘⇧↵`        | Publish                                  | studio |
| `Escape`     | Dismiss / clear selection                | global |
| `?`          | Shortcut reference (when not in a field) | global |
| `F6` / `⇧F6` | Move focus to the next / previous region | global |

`⌘K` is the universal entry point. Anything reachable in the product is reachable from it, including from inside any text field except rich text, where `⌘K` inserts a link.

Settings has no shortcut. `⌘,` is a browser menu accelerator on macOS and cannot be relied upon; Settings is one `⌘K` away.

Preview is `⌘⌥P`, not `⌘⇧P`: Firefox handles `⌘⇧P` (private window) before the page sees it.

## History

| Shortcut | Command                                                           |
| -------- | ----------------------------------------------------------------- |
| `⌘Z`     | Undo                                                              |
| `⌘⇧Z`    | Redo                                                              |
| `Ctrl+Y` | Redo (Windows and Linux only — `⌘Y` is Safari's History on macOS) |
| `⌘⌥Z`    | Open History panel                                                |

Undo depth is 50 states, per [history-versioning.md](./history-versioning.md).

## Selection

| Shortcut               | Command                                            |
| ---------------------- | -------------------------------------------------- |
| `⌘A`                   | Select all siblings                                |
| `Tab`                  | Select next sibling (while a node is selected)     |
| `⇧Tab`                 | Select previous sibling (while a node is selected) |
| `↵`                    | Enter — see below                                  |
| `⇧↵`                   | Select parent                                      |
| `Escape`               | Exit edit mode, then clear selection               |
| `⇧Click`               | Add to selection                                   |
| `⌘Click`               | Select deepest node under cursor                   |
| `⌘⇧Click`              | Toggle node in selection                           |
| `Drag on empty canvas` | Box selection                                      |

`↵` and `⇧↵` walk **down** and **up** the tree, mirroring the breadcrumb navigation in [editor-behavior.md](./editor-behavior.md). That is how users move through deep nesting without the mouse.

`↵` is a single context-aware command, not two bindings:

```
Selected node is a text node    → enter text edit mode
Selected node has children      → select its first child
Otherwise                       → no-op
```

`Escape` follows [editor-behavior.md](./editor-behavior.md) exactly: the first press exits edit mode if active, the next clears the selection.

There is no separate "deselect all" shortcut. `⌘⇧A` is Chrome's tab search on macOS, and `Escape` already does the job.

## Editing

| Shortcut       | Command           |
| -------------- | ----------------- |
| `⌘C`           | Copy              |
| `⌘X`           | Cut               |
| `⌘V`           | Paste             |
| `⌘⇧V`          | Paste in place    |
| `⌘⌥V`          | Paste styles only |
| `⌘D`           | Duplicate         |
| `⌫` / `Delete` | Delete            |
| `F2`           | Rename in Layers  |

`⌘⌥V` pastes the copied node's style block onto the current selection without changing content. It is one of the highest-leverage shortcuts in the editor.

## Structure

| Shortcut                   | Command              |
| -------------------------- | -------------------- |
| `⌘G`                       | Group into Container |
| `⌘⇧G`                      | Ungroup              |
| `⌘⌥G`                      | Wrap in Stack        |
| `⌘]`                       | Bring forward        |
| `⌘[`                       | Send backward        |
| `⌘⌥]`                      | Bring to front       |
| `⌘⌥[`                      | Send to back         |
| `⌘L` _(canvas scope only)_ | Lock / unlock        |
| `⌘⇧H`                      | Hide / show          |

`⌘L` is browser "focus address bar" and is therefore bound **only** inside the canvas scope with the selection sub-scope active, and only when the canvas has genuine focus. Outside those conditions the browser keeps it.

Several bindings in this table shadow browser shortcuts on purpose, following Figma's conventions. Each is listed under **Documented Exceptions** below.

## Movement

| Shortcut        | Command                |
| --------------- | ---------------------- |
| `←` `→` `↑` `↓` | Nudge 1px              |
| `⇧` + arrows    | Nudge 10px             |
| `⌘↑` / `⌘↓`     | Move among siblings    |
| `⌘⇧↑` / `⌘⇧↓`   | Move across containers |

`⌘←` and `⌘→` are deliberately unbound: on macOS they are browser Back and Forward.

Nudge applies to the active breakpoint only, consistent with responsive editing rules.

## Canvas & Viewport

| Shortcut              | Command            |
| --------------------- | ------------------ |
| `Space` (hold) + drag | Pan                |
| `⌘` + scroll          | Zoom to cursor     |
| `⌘+`                  | Zoom in            |
| `⌘-`                  | Zoom out           |
| `⌘0`                  | Zoom to 100%       |
| `⇧1`                  | Zoom to fit page   |
| `⇧2`                  | Zoom to selection  |
| `⇧D`                  | Desktop breakpoint |
| `⇧T`                  | Tablet breakpoint  |
| `⇧M`                  | Mobile breakpoint  |

`⌘1`–`⌘9` switch browser tabs and are never bound.
| `⌘;` | Toggle guides |
| `⌘'` | Toggle grid |
| `⌘⇧;` | Toggle snapping |
| `⌘R` _(canvas scope only)_ | Toggle rulers |

Zoom range is 10%–400%, per [editor-behavior.md](./editor-behavior.md).

`⌘R` shadows browser reload and is therefore canvas-scoped, opt-in via settings, and disabled by default. Users who want it must enable it knowingly.

## Panels

| Shortcut | Command                        |
| -------- | ------------------------------ |
| `⌘\`     | Toggle left sidebar            |
| `⌘⇧\`    | Toggle right inspector         |
| `⌘.`     | Toggle all panels (focus mode) |
| `⌥1`     | Components                     |
| `⌥2`     | Layers                         |
| `⌥3`     | Pages                          |
| `⌥4`     | Assets                         |
| `⌥5`     | Templates                      |
| `⌥6`     | Theme                          |

`⌘.` collapses both panels to maximize the canvas. It is the editor's zen mode.

## Insertion

Insertion uses **single-letter** shortcuts, available in the canvas scope when no text field is focused. This is the Figma convention and it is what makes rapid building possible.

| Key | Insert                    |
| --- | ------------------------- |
| `S` | Section                   |
| `C` | Container                 |
| `T` | Text                      |
| `H` | Heading                   |
| `B` | Button                    |
| `I` | Image                     |
| `D` | Divider                   |
| `E` | Spacer                    |
| `G` | Grid                      |
| `K` | Stack                     |
| `/` | Quick insert (searchable) |

Registered by plugins, not by the core editor, since the components belong to them:

| Key | Insert          | Registered by        |
| --- | --------------- | -------------------- |
| `F` | Form Input      | `plugins/core-forms` |
| `P` | Payment Element | `plugins/checkout`   |
| `O` | Order Summary   | `plugins/checkout`   |

A plugin's insertion keys exist only while the plugin is registered, so conflict detection never sees a binding to a command that does not exist.

After pressing an insertion key, the component is placed inside the current selection if it accepts children, otherwise after it as a sibling. Placement is always shown by the same drop indicator used during drag.

`/` opens an inline searchable inserter at the current insertion point — the fastest path to any component in the library.

## Inspector

| Shortcut                     | Command                  |
| ---------------------------- | ------------------------ |
| `⌘F`                         | Search properties        |
| `⌥Click` a property label    | Reset to default         |
| `↑` `↓` in a numeric field   | ±1                       |
| `⇧↑` `⇧↓` in a numeric field | ±10                      |
| `⌥↑` `⌥↓` in a numeric field | ±0.1                     |
| `Tab`                        | Next property            |
| `⌘↵`                         | Apply to all breakpoints |

`⌘↵` in the inspector is the answer to "I set this on desktop and now I have to do it twice more."

## Layers

| Shortcut              | Command                         |
| --------------------- | ------------------------------- |
| `↑` `↓`               | Navigate                        |
| `←`                   | Collapse / go to parent         |
| `→`                   | Expand / go to first child      |
| `↵`                   | Select on canvas                |
| `F2`                  | Rename                          |
| `⌥Click` a disclosure | Expand/collapse all descendants |
| `⌘F`                  | Search layers                   |

## Command Palette

| Shortcut | Command                                          |
| -------- | ------------------------------------------------ |
| `⌘K`     | Open                                             |
| `↑` `↓`  | Navigate results                                 |
| `↵`      | Run                                              |
| `⌘↵`     | Run in a new context (e.g. open page in new tab) |
| `Tab`    | Enter a result's sub-menu                        |
| `Escape` | Close                                            |
| `>`      | Filter to commands                               |
| `#`      | Filter to pages                                  |
| `@`      | Filter to components on this page                |
| `:`      | Jump to a node by name                           |

## Dialogs

| Shortcut       | Command                        |
| -------------- | ------------------------------ |
| `Escape`       | Cancel                         |
| `↵`            | Confirm primary action         |
| `⌘↵`           | Confirm from within a textarea |
| `Tab` / `⇧Tab` | Cycle focus (trapped)          |

Destructive dialogs never confirm on `↵` alone. They require an explicit click or `⌘↵`, per [ui-guidelines.md](./ui-guidelines.md).

---

# Reserved Keys

These are never bound by the core editor and are rejected if a plugin attempts to register them.

```
⌘T   ⌘W   ⌘N   ⌘Q   ⌘M   ⌘H
⌘⇧T  ⌘⇧N  ⌘⇧W  ⌘⇧A  ⌘⇧P  ⌘Y (macOS)
⌘1 … ⌘9   ⌘,   ⌘← ⌘→ (macOS)
⌘P   ⌘F (browser find, outside inspector/layers scope)
F5   F11  F12
⌘⌥I  ⌘⌥J  ⌘⌥C
Alt+Tab, ⌘Tab, ⌘`
```

`⌘L` and `⌘R` are **conditionally** reserved — bound only within the canvas scope, and `⌘R` only when explicitly enabled.

## Documented Exceptions

These bindings shadow a browser shortcut deliberately. Each is bound only in the `canvas` scope, only while the canvas has focus, and calls `preventDefault` only when its command is available. Anywhere else, the browser keeps the key.

| Binding            | Our command                   | Browser meaning shadowed |
| ------------------ | ----------------------------- | ------------------------ |
| `⌘D`               | Duplicate                     | Bookmark page            |
| `⌘G` / `⌘⇧G`       | Group / Ungroup               | Find next / previous     |
| `⌘[` / `⌘]`        | Send backward / Bring forward | Back / Forward (macOS)   |
| `⌘0` / `⌘+` / `⌘-` | Canvas zoom                   | Page zoom                |
| `⌘⇧H`              | Hide / show                   | Home page                |
| `⌘↑` / `⌘↓`        | Move among siblings           | Scroll to top / bottom   |
| `⌘L`               | Lock                          | Focus address bar        |
| `⌘R`               | Toggle rulers (opt-in)        | Reload                   |

These match Figma and Framer, which is why they are worth the exception. A binding not on this list that shadows a browser shortcut is a defect.

The registry enforces this list at registration time, not at dispatch time. A violating plugin fails to load with a clear error.

---

# Internal Structure

## Package Layout

```
packages/editor/src/keyboard/
├── index.ts                  Public API
├── registry.ts               KeymapRegistry
├── dispatcher.ts             Keystroke → command resolution
├── scopes.ts                 Scope stack and activation
├── normalize.ts              Platform + layout normalization
├── chords.ts                 Multi-stroke sequence buffer
├── guards.ts                 Text input guard
├── conflicts.ts              Startup conflict detection
├── reserved.ts               Reserved key table
├── defaults/
│   ├── global.ts
│   ├── canvas.ts
│   ├── layers.ts
│   ├── inspector.ts
│   ├── insertion.ts
│   └── overlay.ts
├── presets/
│   ├── default.ts
│   ├── figma.ts
│   └── framer.ts
├── persistence.ts            User customizations
├── hooks/
│   ├── useShortcut.ts
│   ├── useScope.ts
│   └── useShortcutLabel.ts
└── types.ts
```

## Types

```ts
export interface KeyBinding {
  /** Physical key code, e.g. "KeyD", "Digit1", "ArrowUp", "Escape". */
  key: string
  /** Primary modifier: Cmd on macOS, Ctrl elsewhere. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /** Literal Control. Avoid unless platforms genuinely differ. */
  ctrl?: boolean
  /** Multi-stroke sequence, e.g. ⌥K then P. */
  chord?: KeyBinding[]
}

export interface ShortcutRegistration {
  /** Command this binding invokes. Must already exist in the command registry. */
  commandId: string
  binding: KeyBinding
  scope: ScopeId
  /** Higher wins when two bindings share a scope. Core defaults are 0. */
  priority?: number
  /** Repeat while held. Nudge uses this; destructive commands never do. */
  allowRepeat?: boolean
  /** Prevent the browser default. Defaults to true. */
  preventDefault?: boolean
  /** Owning plugin, when applicable. */
  pluginId?: string
}

export interface Command {
  id: string
  title: string
  category: CommandCategory
  icon?: string
  keywords?: string[]
  /** May this command run right now? */
  isAvailable: (ctx: EditorContext) => boolean
  /** Optional toggle state, shown in menus. */
  isActive?: (ctx: EditorContext) => boolean
  run: (ctx: EditorContext, args?: unknown) => void | Promise<void>
  /** Does this command mutate the document? Drives history grouping. */
  mutates: boolean
}

export type CommandCategory =
  | "file"
  | "edit"
  | "insert"
  | "selection"
  | "arrange"
  | "view"
  | "theme"
  | "publish"
  | "navigation"
  | "help"
  | "plugin"

export type ScopeId =
  | "global"
  | "dashboard"
  | "studio"
  | "canvas"
  | "canvas.selection"
  | "canvas.multi-selection"
  | "canvas.text-editing"
  | "layers"
  | "inspector"
  | "library"
  | "overlay.dialog"
  | "overlay.command-palette"
  | "overlay.context-menu"

export interface KeymapRegistry {
  register(registration: ShortcutRegistration): Disposable
  unregister(commandId: string, scope: ScopeId): void
  resolve(event: KeyboardEvent, activeScopes: ScopeId[]): Command | null
  /** For rendering labels in menus, tooltips, and the palette. */
  bindingFor(commandId: string): KeyBinding | null
  format(binding: KeyBinding, platform: Platform): string
  conflicts(): ShortcutConflict[]
}

export interface ShortcutConflict {
  binding: KeyBinding
  scope: ScopeId
  commandIds: string[]
  severity: "error" | "warning"
}
```

## Registration

Core bindings are declared as data, not imperatively.

```ts
export const canvasShortcuts: ShortcutRegistration[] = [
  { commandId: "edit.duplicate", binding: { key: "KeyD", mod: true }, scope: "canvas" }, // shadows ⌘D; availability-gated
  { commandId: "edit.delete", binding: { key: "Backspace" }, scope: "canvas.selection" },
  { commandId: "edit.delete", binding: { key: "Delete" }, scope: "canvas.selection" },
  {
    commandId: "arrange.group",
    binding: { key: "KeyG", mod: true },
    scope: "canvas.multi-selection",
  },
  {
    commandId: "node.nudge.up",
    binding: { key: "ArrowUp" },
    scope: "canvas.selection",
    allowRepeat: true,
  },
]
```

Declarative registration is what makes startup conflict detection, the shortcut reference sheet, and user customization possible without any of them knowing about each other.

## Conflict Detection

Runs once at application startup, and again whenever a plugin loads.

```
For each scope:
  Group registrations by normalized binding.
  More than one registration with equal priority → error.
  More than one with differing priority → warning, highest wins.
  Any binding in the reserved table → error.
  Any binding whose command does not exist → error.
```

Errors fail the build in CI and block plugin activation at runtime.

They never fail silently, because a silently shadowed shortcut is nearly impossible to diagnose later.

---

# Chords

Multi-stroke sequences extend the keyspace without stacking modifiers.

The chord leader is `⌥K`. It is not `⌘K`: that opens the command palette immediately, and once the palette is open its overlay scope is exclusive, so a second keystroke would be typed into the search box.

```
⌥K then P     →  Publish
⌥K then T     →  Insert Template
⌥K then S     →  Save named snapshot
⌥K then D     →  Duplicate page
```

Behavior

- After the leader key, a hint bar appears at the bottom of the screen showing available continuations.
- The chord buffer times out after 2,000 ms.
- `Escape` cancels immediately.
- An unmatched second stroke cancels and is discarded, never passed through.

Chords are for infrequent commands. Anything used more than a few times an hour deserves a single binding.

---

# Customization

Users may rebind any non-reserved shortcut.

```ts
export interface UserKeymap {
  userId: string
  preset: "default" | "figma" | "framer" | "custom"
  /** Sparse. Only what differs from the preset. */
  overrides: Array<{
    commandId: string
    scope: ScopeId
    binding: KeyBinding | null // null disables the shortcut
  }>
  updatedAt: string
}
```

Rules

- Overrides are stored per user and sync across devices.
- Rebinding onto a reserved key is refused with an explanation.
- Rebinding onto an occupied key shows the conflict and offers to unbind the incumbent.
- A single "Reset all" restores the active preset.
- Keymaps export and import as JSON.

The customization UI lives in Settings → Keyboard and doubles as the searchable shortcut reference.

---

# Discoverability

A shortcut nobody knows about does not exist.

Five surfaces teach them, and all five read from the same registry.

**1. Inline labels.**

Every menu item and context menu row shows its binding, right-aligned.

**2. Tooltips.**

Every toolbar button shows its binding after the standard tooltip delay.

```
┌──────────────────────┐
│  Duplicate      ⌘D   │
└──────────────────────┘
```

**3. Command Palette.**

Every result shows its binding. Users learn shortcuts by using the palette and noticing them.

**4. Reference sheet.**

`⌘/` opens a searchable, printable overlay grouped by category, showing the user's actual bindings including customizations.

**5. Contextual hints.**

The status bar surfaces a relevant hint during certain states.

```
Dragging:      "Hold ⌥ to duplicate · Hold ⇧ to constrain"
Text editing:  "⌘↵ to finish"
Multi-select:  "⌘G to group"
```

Hints fade after a few seconds and can be disabled permanently.

---

# Accessibility

Shortcuts are an accessibility feature. They are also an accessibility risk if implemented carelessly.

**Every command is reachable without shortcuts.**

Menus, palette, and toolbars cover 100% of commands. No functionality is shortcut-only.

**Single-key shortcuts are suppressible.**

Insertion keys (`S`, `C`, `T`…), `/`, `?`, `M`, and the `⇧`-letter breakpoint keys are character-key shortcuts, which WCAG 2.1 SC 2.1.4 requires be remappable or disableable.

Settings → Keyboard provides both:

- **Remap** any of them individually.
- **Turn off character-key shortcuts** entirely. Every one of those commands remains available from the command palette (`⌘K`), the component library, and the toolbar.

There is no "add a modifier" mode. On Windows the obvious modifier, `Alt`, collides with browser menu keys (`Alt+D`, `Alt+E`, `Alt+F`).

**Focus is never trapped without escape.**

`Escape` always exits the current context. This is unconditional.

**Focus is always visible.**

The focus ring uses `--color-focus-ring` and is never suppressed, per [design-system.md](./design-system.md).

**Screen reader announcements.**

Commands that change state announce the result via a polite live region.

```
"Duplicated Section. 3 items selected."
"Undid: Delete Heading."
"Switched to mobile breakpoint."
```

**Tab order is logical.**

Toolbar → left sidebar → canvas → inspector → status bar. Panels are landmark regions with accessible names.

Inside the canvas, `Tab` moves between sibling nodes while a node is selected. Focus is never trapped there:

- `F6` / `⇧F6` always moves to the next or previous region.
- With nothing selected, `Tab` leaves the canvas.
- `Escape` clears the selection, after which `Tab` leaves the canvas.

**Keyboard drag and drop.**

Nodes can be moved entirely by keyboard in two ways.

**Immediate moves** — `⌘↑` / `⌘↓` and `⌘⇧↑` / `⌘⇧↓` move the selection one position at a time. Each move is committed and undoable; there is nothing to cancel.

**Keyboard drag mode** — for placing a node precisely anywhere in the tree:

```
Select node
    ↓
M          pick up — the node lifts, the drop indicator appears
    ↓
↑ ↓        move the drop indicator through every valid position
← →        move out of / into the neighboring container
    ↓
Each candidate position is announced
    ↓
↵          drop — one history entry
Escape     cancel — the node returns to where it was
```

The mode is implemented with dnd-kit's keyboard sensor, rebound from its defaults (`Space` / `Enter`), which are already taken by pan and `↵`.

This satisfies the requirement in [testing.md](./testing.md) that drag and drop be keyboard-testable.

---

# Plugin Integration

Plugins register shortcuts through the public API only.

```ts
export function activate(api: PluginApi): void {
  api.commands.register({
    id: "coupon.focus-field",
    title: "Focus Coupon Field",
    category: "plugin",
    mutates: false,
    isAvailable: (ctx) => ctx.page.hasComponent("checkout.coupon"),
    run: (ctx) => ctx.focusComponent("checkout.coupon"),
  })

  api.shortcuts.register({
    commandId: "coupon.focus-field",
    binding: { key: "KeyK", alt: true, chord: [{ key: "KeyC" }] },
    scope: "canvas",
  })
}
```

Rules for plugins

- A plugin may not register a reserved key. Enforced at registration.
- A plugin may not override a core binding without explicit user approval, per [plugin-api.md](./plugin-api.md).
- Plugin bindings should prefer chords under the `⌥K` leader, which is effectively unlimited namespace.
- Disposing a plugin unregisters every one of its bindings. Leaked bindings are treated as a plugin defect.
- Plugin shortcuts appear in the reference sheet grouped under the plugin's name.

---

# Workflows

## Build a section without touching the mouse

```
S          insert Section
H          insert Heading
↵          edit text  → type headline → ⌘↵ (commits; the Heading stays selected)
B          insert Button — after the Heading, since a Heading takes no children
⌘⌥V        paste styles from a previous button
⇧T         check tablet
⇧M         check mobile
⌘S         save
```

## Fix a spacing mistake across breakpoints

```
Click node
⌘F         search properties → "padding"
↑ ↑ ↑      increase
⌘↵         apply to all breakpoints
⌘Z         undo if wrong
```

## Reorganize structure

```
⇧Click three siblings
⌘G         group into a Container
⌥2         open Layers
F2         rename to "Trust Row"
↵          back to canvas
⌘⇧↑        move up, out of its container, above the payment section
```

## Publish

```
⌘⌥P        preview
Escape     close preview
⌘⇧↵        publish
⌘↵         confirm — publishing is consequential, so ↵ alone never confirms it
```

---

# Best Practices

**Register the command first.**

A shortcut is a binding to a command. Building the handler inside a key listener guarantees the action will never appear in the palette.

**Choose the narrowest scope.**

`canvas.selection` over `canvas` over `studio` over `global`.

**Never bind a destructive command to a repeating key.**

`allowRepeat` on delete would let a held key destroy a page.

**Group the history entry.**

Ten rapid nudges are one undo step, not ten. Grouping is the command's responsibility.

**Mirror the mouse action exactly.**

`⌘D` must produce the identical result to the toolbar duplicate button, including selection state afterwards.

**Test with a non-US layout.**

Binding on `event.key` breaks on AZERTY. Binding on `event.code` does not.

**Never `preventDefault` unconditionally.**

Only prevent the default when a binding actually matched and its availability check passed.

**Announce state changes.**

A sighted user sees the canvas change. A screen reader user needs to be told.

---

# Performance Considerations

| Operation                     | Target   |
| ----------------------------- | -------- |
| Keystroke → command dispatch  | < 1 ms   |
| Binding lookup                | O(1)     |
| Scope resolution              | < 0.1 ms |
| Held-arrow nudge              | 60 FPS   |
| Command palette open          | < 50 ms  |
| Palette search (500 commands) | < 16 ms  |

Techniques

**One listener.**

A single `keydown` listener at the window level, not one per component. Per-component listeners are the primary cause of shortcut leakage.

**Hash the binding.**

Normalized bindings hash to a string key, so lookup is a map access rather than a scan.

```
"mod+shift+KeyZ"  →  "history.redo"
```

**Cache the scope stack.**

Recomputed on focus change, not on every keystroke.

**Never allocate in the hot path.**

Normalization reuses a scratch object. A keystroke should produce zero garbage.

**Batch repeated commands.**

Held nudges coalesce into a single state update per animation frame, keeping the canvas at 60 FPS per [performance.md](./performance.md).

**Precompute labels.**

Formatted shortcut strings are computed once per keymap version and cached, not formatted per tooltip render.

---

# Security Considerations

Shortcuts are a low-risk surface, but three concerns are real.

**Clipboard access.**

`⌘C` / `⌘V` use the async Clipboard API, which requires user activation and permission. The editor maintains an internal clipboard as a fallback so copy/paste works even when system clipboard permission is denied. Node data written to the system clipboard is redacted the same way an export is — no tenant ids, no credentials. See [export-import.md](./export-import.md).

**Paste is untrusted input.**

Content pasted from outside the editor is validated against the schema before insertion, exactly like an import. Pasted HTML is sanitized. Pasted JSON claiming to be a node tree goes through the full import validation pipeline.

**Destructive commands require intent.**

Publish, delete page, delete project, and restore revision are never single-keystroke operations. Each requires either a confirmation dialog or an explicit two-step chord.

**Plugin bindings cannot escalate.**

A plugin shortcut invokes a plugin command, which runs under the plugin's declared permissions. A shortcut grants no capability the plugin does not already have.

---

# Testing Requirements

```
Resolution           every binding resolves to its command in its scope
Scope isolation      canvas bindings never fire in a dialog
Text guard           ⌫ in a text field never deletes a node
Reserved keys        every reserved key passes through to the browser
Conflicts            duplicate registration fails at startup
Platform             ⌘ on macOS, Ctrl on Windows, for every binding
Layout               AZERTY and Dvorak produce identical behavior
Chords               timeout, cancel, and unmatched-continuation paths
Repeat               held arrows nudge; held ⌫ deletes exactly once
History grouping     10 rapid nudges → 1 undo step
Customization        override, disable, conflict, reset, export, import
Plugin lifecycle     dispose unregisters every binding
Accessibility        every command reachable without a keyboard shortcut
Announcements        state-changing commands announce via live region
Keyboard DnD         move a node across containers with keys only
```

E2E coverage runs the full keyboard-only build workflow in Playwright, per [testing.md](./testing.md).

---

# Future Expansion

**Keymap presets.**

Figma and Framer presets ship at launch. Sketch, Webflow, and VS Code presets are additive data files requiring no code change.

**Recording and macros.**

Capture a command sequence and bind it. Because every action is already a command with serializable arguments, macros are a list of command invocations.

**Contextual suggestion.**

Detecting repeated mouse use of a command and offering its shortcut, once, unobtrusively.

**Vim mode.**

A modal scope layer for power users. The scope system already supports mutually exclusive activation.

**Multi-key leader sequences.**

Extending the chord buffer beyond two strokes for plugin-heavy installations.

**Collaboration awareness.**

Suppressing destructive shortcuts on nodes another editor is actively editing, arriving with Phase 24.

**Shortcut analytics.**

Aggregate, anonymous usage of commands versus their shortcuts, informing which defaults to change. Governed by the privacy rules in [observability.md](./observability.md).

---

# Success Criteria

The system is successful when:

- Every command in the product has a palette entry, and every frequent command has a binding.
- No browser or OS shortcut is ever shadowed outside a narrowly scoped, documented exception.
- `⌫` never deletes a node while a user is typing.
- A conflicting registration fails loudly at startup rather than silently at runtime.
- A complete checkout can be built, previewed, and published without a mouse.
- Bindings behave identically on QWERTY, AZERTY, and Dvorak.
- Keystroke to visible result stays under one frame.
- Every shortcut is discoverable from at least three surfaces without documentation.
- Single-key insertion shortcuts can be disabled, satisfying WCAG 2.1 SC 2.1.4.

---

# Philosophy

Shortcuts are how a tool earns a professional's trust.

The first hour with a builder is about the mouse. The hundredth hour is about the keyboard. A product that only optimizes the first hour feels approachable and then, permanently, slow.

Every shortcut is a promise: this action is common enough that we expect you to do it thousands of times, and we have removed every millisecond we could from between your intent and the result.

Break that promise — by shadowing a browser key, by deleting a component while someone was typing, by silently rebinding what a plugin took — and the user stops trusting the keyboard entirely.

Keep it, and the editor disappears.
