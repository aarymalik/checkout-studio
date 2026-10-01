# @checkout-studio/renderer

Turns a schema into a page, and knows nothing about the editor.

```tsx
const prepared = prepare(revision.schema, { registry, theme: revision.theme })

if (!prepared.ok) {
  // The application owns the fallback chain: this revision → the last known
  // good one → a branded error page. The renderer has no database.
}

;<CheckoutRenderer
  schema={prepared.document}
  theme={revision.theme}
  registry={registry}
  mode="published"
/>
```

## What it guarantees

- **Pure.** The same schema, theme and registry always produce the same output,
  and neither the schema nor the theme is ever modified. Asserted against frozen
  inputs.
- **It always renders.** A broken component costs its own section. An unknown
  type becomes an invisible placeholder that keeps its space. Neither costs the
  page.
- **No schema content is ever evaluated.** There is no `eval` and no `Function`
  in the package, and the only `dangerouslySetInnerHTML` carries the stylesheet.
- **Identical HTML at every width.** Breakpoints are media-query CSS, and
  breakpoint-only visibility is a `display` rule — never an omitted node. That is
  what prevents a wrong first paint and a hydration mismatch.
- **No builder code.** No editor, no Studio UI, no design system, no database, no
  API. Enforced by `scripts/check-renderer-deps.mjs` as well as by the layer
  model.

## The six-stage cascade

```
1. Theme defaults       the component's theme slot
2. Component defaults   the component's own defaultStyles
3. Node base styles
4. Responsive           desktop → tablet → mobile
5. State                hover, focus, active, disabled
6. Visibility
```

Stages 1 and 2 are one flat layer beneath the node. That reconciles the two
rules the specification asks for at once — "later stage overrides earlier" and
"component default used when no theme value" — and matches the data: a theme slot
has no breakpoints.

## Modes

| Mode             | Breakpoints         | A failure shows      |
| ---------------- | ------------------- | -------------------- |
| `published`      | all, as media CSS   | nothing, logged      |
| `static`         | all, as media CSS   | nothing, logged      |
| `embed`          | all, as media CSS   | nothing, logged      |
| `editor-preview` | one, resolved in JS | the component's name |

Editor preview resolves one breakpoint rather than emitting media queries,
because a device frame sits inside a browser window of some other width: a
1440px frame in a 900px window would pick up tablet styles.

## Not in here

The engine ships no components. They arrive in Phase 9, through the registry.
Everything in these tests is a fixture.

See [docs/renderer.md](../../docs/renderer.md) and
[docs/theme-system.md](../../docs/theme-system.md).
