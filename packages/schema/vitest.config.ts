import { createVitestConfig } from "@checkout-studio/config/vitest/base"

/**
 * The schema is held at 100%.
 *
 * Everything in this package is a pure function over the document, and every
 * one of them is reachable from a person clicking something. An untested branch
 * here is a way to produce a tree that validation would have rejected — and the
 * first anyone would know is a page that no longer opens.
 *
 * Per docs/phases.md, Phase 5.
 */
export default createVitestConfig({
  environment: "node",
  thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
})
