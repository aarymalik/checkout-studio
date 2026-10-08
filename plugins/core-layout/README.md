# @checkout-studio/plugin-core-layout

Section, and the page root every document already had.

The first plugin, and the reference for the rest: docs/phases.md Phase 9 step 1
asks for the authoring pattern to be established with Section before eighteen
more components follow it.

```
src/components/<name>/definition.ts   what the engine knows
src/components/<name>/Renderer.tsx    what the browser gets
src/components/<name>/properties.ts   what the inspector offers
```

Three entry points, so the published checkout never downloads editor-only code:

| Entry        | Holds                               | Imported by                     |
| ------------ | ----------------------------------- | ------------------------------- |
| `.`          | the manifest                        | both, and the host              |
| `./renderer` | component definitions and renderers | the studio and the renderer app |
| `./editor`   | property definitions                | the inspector, in Phase 12      |

## The namespace

This plugin's id is `core-layout` and it registers into `core`, which it
declares in its manifest. The catalog in docs/component-library.md holds that
the `core` namespace is shared by the `core-*` plugins, and the engine's own
root node type is `core.page` — so `core` was never one plugin's to own.
