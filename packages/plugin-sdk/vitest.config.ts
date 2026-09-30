import { createVitestConfig } from "@checkout-studio/config/vitest/base"

/**
 * The plugin SDK is held at 100%.
 *
 * Per docs/phases.md, Phase 6. Everything here decides whether a plugin runs
 * and what it is allowed to do; an untested branch is a plugin activating with
 * a permission nobody granted, or one plugin silently replacing another's
 * components.
 */
export default createVitestConfig({
  environment: "jsdom",
  thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
})
