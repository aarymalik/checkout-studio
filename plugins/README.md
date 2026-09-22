# Plugins

Everything beyond the core editing experience lives here, per
[docs/plugin-api.md](../docs/plugin-api.md).

The engine — `schema`, `editor`, `renderer`, `plugin-sdk` — knows nothing about
checkout. Components, their property definitions, validators, commands and
providers are all contributed by plugins, which is what allows a second product
to reuse the engine unchanged.

Each plugin ships three entry points so the published checkout never downloads
editor-only code:

```
src/index.ts      the manifest
src/renderer.ts   component definitions and their Renderer.tsx files
src/editor.ts     property definitions, icons, previews
```

Create one with:

```bash
node scripts/create-plugin.ts checkout --description "Payment Element, Order Summary…"
```

The first plugins arrive in Phase 9. See [docs/phases.md](../docs/phases.md).
