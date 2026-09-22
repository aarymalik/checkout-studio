# @checkout-studio/config

Shared tooling configuration: ESLint, TypeScript, Prettier, Vitest, Tailwind.

**Layer 0.** Depends on nothing. Every other package extends these presets rather than
defining its own, so there is exactly one rule set in the repository.

`layers.js` is the single source of truth for the layer model in
[docs/monorepo-structure.md](../../docs/monorepo-structure.md). The ESLint boundaries preset,
the dependency-cruiser configuration, and the package generator all read it.

Does not contain: runtime code of any kind.
