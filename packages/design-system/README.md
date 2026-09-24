# @checkout-studio/design-system

Studio design tokens and themes. The product interface is built entirely from
these; nothing in `packages/ui` or `apps/studio` carries a colour, size, radius
or duration of its own.

Specification: [docs/theme-system.md](../../docs/theme-system.md) ·
[docs/design-system.md](../../docs/design-system.md)

## The three tiers

```
component token  →  semantic  →  primitive  →  value

--cs-button-primary-bg  →  --cs-color-primary  →  --cs-blue-600  →  #2563eb
```

A component reads the **semantic** tier and nothing else. Primitives hold
values and are named after them, never after a role — the tiers share one
namespace, so a primitive called `radius-card` and a semantic of the same name
would compile to `--cs-radius-card: var(--cs-radius-card)`, which CSS discards
without a word.

Switching mode rebinds the semantic tier and moves nothing else, which is why
no component contains a conditional for dark mode.

## Using it

From an application's stylesheet, in this order:

```css
@import "@checkout-studio/config/tailwind/base.css";
@import "@checkout-studio/design-system/css/variables.css";
@import "@checkout-studio/design-system/tailwind/tokens.css";
@import "@checkout-studio/design-system/css/reset.css";
```

From its root layout, so the first frame is already the right theme:

```tsx
import { themeScript } from "@checkout-studio/design-system"

<html lang="en" suppressHydrationWarning>
  <head>
    <script dangerouslySetInnerHTML={{ __html: themeScript }} />
  </head>
```

Then write meaning, not values:

```tsx
<div className="bg-surface text-foreground rounded-card shadow-card p-6" />
```

## Changing a token

`src/css/variables.css` is generated and committed. Edit the tokens, then:

```bash
pnpm --filter @checkout-studio/design-system tokens:build
```

A test fails if the committed file does not match the generator, so the two
cannot drift.

## What the tests hold to

- Every semantic resolves to a primitive that exists, in all four combinations
  of mode and contrast
- Every component token resolves to a semantic, never to a primitive
- The tiers are disjoint, so no token can reference itself
- Dark mode rebinds exactly the same names light mode defines
- Every declared pairing meets WCAG AA — in light, dark, and both at high
  contrast
- Tailwind utilities reach semantics only
- The pre-paint script writes an explicit mode, and still paints when storage
  throws

Contrast is the one design property that cannot be judged by eye, so
`CONTRAST_PAIRINGS` lists the pairs the product actually renders and the suite
measures every one. `color-border` is deliberately absent: WCAG 1.4.11 governs
the boundaries of controls, not decoration. Anything a reader must see to
operate a control uses `color-border-strong`, which is in the list.

Repository-wide, `pnpm tokens:check` fails any component carrying a hardcoded
colour, length or duration.
