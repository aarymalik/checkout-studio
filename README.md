# Checkout Studio

A premium drag-and-drop checkout builder with native Stripe integration, built on
**VisualEngine** — a generic visual editing platform.

The full engineering blueprint is in [docs/](./docs/README.md). Start there.

## Quick start

```bash
pnpm install
cp .env.example .env.local     # then fill in; every value is validated at startup
pnpm install                   # links .env.local into each app
pnpm dev
```

```
Studio    http://localhost:3000
Checkout  http://localhost:3001
```

## Commands

```bash
pnpm dev          # both applications
pnpm check        # lint · typecheck · test · build · boundaries
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm boundaries   # layer model: declared dependencies and the resolved graph
pnpm graph        # write the dependency graph to graph.dot
```

## Layout

```
apps/       studio (editor) · renderer (published checkouts)
packages/   the engine and everything shared — see docs/monorepo-structure.md
plugins/    components and behavior; the engine knows nothing about checkout
docs/       specifications
scripts/    repository tooling
```

The architecture is enforced by tooling, not by discipline: a forbidden import
fails lint with the reason it is forbidden, and the resolved dependency graph is
checked for cycles and layer violations on every pull request.

## Where to start

| You want to           | Read                                                       |
| --------------------- | ---------------------------------------------------------- |
| Understand the system | [docs/architecture.md](./docs/architecture.md)             |
| Know where code goes  | [docs/monorepo-structure.md](./docs/monorepo-structure.md) |
| Build the next phase  | [docs/phases.md](./docs/phases.md)                         |
| Contribute            | [docs/contributing.md](./docs/contributing.md)             |

# protection probe
