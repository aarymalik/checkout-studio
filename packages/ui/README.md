# @checkout-studio/ui

The Studio component library. shadcn-style owned code on Radix primitives: the
behaviour that is genuinely hard — focus trapping, roving focus, typeahead,
portalled positioning — comes from a library that has been tested against real
assistive technology, while the markup and every style stay ours to change.

Specification: [docs/design-system.md](../../docs/design-system.md) ·
[docs/ui-guidelines.md](../../docs/ui-guidelines.md)

## What is here

```
primitives   Button Input Textarea Select Checkbox Radio Switch
             Tabs Accordion Slider ColorPicker
overlays     Dialog Popover Tooltip DropdownMenu ContextMenu
composites   DataTable SearchInput FileUpload CommandPalette
feedback     Alert Toast Spinner Skeleton EmptyState ErrorState
layout       Panel ResizablePanel Splitter ScrollArea
errors       AppErrorBoundary RouteErrorBoundary PanelErrorBoundary ErrorFallback
```

## The rules these hold to

**Nothing carries a value of its own.** Every colour, size, radius and duration
is a token from `@checkout-studio/design-system`. `pnpm tokens:check` fails a
component that hardcodes one, including a spacing step off the 8px system.

**A label is a prop, not the caller's problem.** An unlabelled input is the most
common accessibility failure there is, and making it impossible costs nothing.

**Validation is text, never colour alone.** Roughly one reader in twelve cannot
use the colour, and nobody can use it in a greyscale print.

**Every component is keyboard-operable**, and axe runs over every one in every
state it can reach.

**`cn()` lets the caller win.** tailwind-merge is taught our scales from the
token source, so `rounded-card` actually replaces `rounded-control` rather than
sitting beside it.

## Testing

```bash
pnpm --filter @checkout-studio/ui test           # 452 tests
pnpm --filter @checkout-studio/ui test:coverage  # floor is 90%
pnpm test:visual                                 # 38 screenshots, light and dark
```

The visual suite renders [the gallery](../../apps/studio/src/app/design) and
photographs every component in both themes. A test asserts that every component
exported here appears in that gallery: a component with no case is a component
nothing is watching.

Two limits worth knowing. jsdom has no layout, so what a component announces and
how it answers a keyboard is tested here while anything positional belongs to
the visual suite. And colour contrast is measured in the design system against
real token values, not by axe, which cannot compute a ratio without a renderer.
