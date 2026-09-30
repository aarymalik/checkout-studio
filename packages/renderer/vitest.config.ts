import { createVitestConfig } from "@checkout-studio/config/vitest/base"

/**
 * The renderer is held at 100%.
 *
 * Per docs/phases.md: "This phase and Phase 5 are the two that must be
 * perfect." A published checkout has the strictest requirement in the product —
 * it must always render — and an untested branch here is a page that does not.
 */
export default createVitestConfig({
  environment: "jsdom",
  setupFiles: ["./tests/setup.ts"],
  // The boundaries log every caught error, which is the point of them. Tests
  // that throw on purpose would otherwise bury the results in stack traces.
  env: { LOG_LEVEL: "fatal" },
  thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
})
