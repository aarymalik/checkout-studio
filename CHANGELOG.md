# Changelog

Notable changes to Checkout Studio, written for the people who use it rather than
the people who build it. Generated from conventional commits, then edited by a human,
per [docs/release-process.md](./docs/release-process.md).

This project follows [Semantic Versioning](https://semver.org/). The schema, renderer
and plugin API version separately; see [docs/compatibility.md](./docs/compatibility.md).

## [Unreleased]

### Added

- Repository foundation: Turborepo and pnpm workspace, 13 packages and two Next.js
  applications, with the layer model from the architecture enforced by lint and by
  dependency analysis rather than by convention.
- Environment validation that fails at startup naming every problem at once, and
  refuses a live Stripe key outside production.
- Continuous integration: lint, typecheck, test, build, layer boundaries and a
  dependency audit on every push.

Nothing is released yet. The first user-facing release is Phase 25.
