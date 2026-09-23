# Contributing

The contribution guide lives in **[docs/contributing.md](./docs/contributing.md)**:
setup, branching, commit format, the RFC process, review expectations, and the
Definition of Done.

Start with [docs/README.md](./docs/README.md) for the documentation index, and
[docs/phases.md](./docs/phases.md) for what is being built now.

Quick version:

```bash
pnpm install
cp .env.example .env.local
pnpm install     # links the env file into each app
pnpm dev
pnpm check       # lint · typecheck · test · build · boundaries
```
