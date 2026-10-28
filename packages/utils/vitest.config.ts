import { coverageThresholds, createVitestConfig } from "@checkout-studio/config/vitest/base"

/**
 * The upload boundary is held to 100%, per docs/phases.md Phase 14.
 *
 * It decides whether bytes somebody sent us may be stored and served at all.
 * An untested branch here is a file type nobody meant to accept, and the first
 * anyone would know is a script being served from our own origin — so the
 * floor for this directory is every branch, not ninety per cent of them.
 *
 * Scoped rather than raised for the package: the rest of `utils` is ordinary
 * code and does not earn the same cost.
 */
export default createVitestConfig({
  environment: "node",
  thresholds: {
    ...coverageThresholds,
    "src/uploads/*.ts": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
})
