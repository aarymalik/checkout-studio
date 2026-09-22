# @checkout-studio/api

API contracts, handlers and services. All server logic lives here, not in route files.

**Layer 5.** May depend on: config, types, utils, schema, design-system, observability, plugin-sdk, database, ui, hooks, renderer.

Does not contain: UI, and any direct plugin import — registries are injected by the app.

See [docs/monorepo-structure.md](../../docs/monorepo-structure.md).
