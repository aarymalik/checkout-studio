import { fileURLToPath } from "node:url"
import { coverageThresholds, createVitestConfig } from "@checkout-studio/config/vitest/base"

/**
 * The keyboard core is held at 100%.
 *
 * Every branch in it decides whether a keystroke does something, does something
 * else, or is handed to the browser — and a wrong answer is close to
 * undiagnosable from a bug report. Per docs/phases.md, Phase 4.
 */
export default createVitestConfig({
  environment: "jsdom",
  setupFiles: [fileURLToPath(new URL("./tests/setup.ts", import.meta.url))],
  thresholds: {
    ...coverageThresholds,
    "src/keyboard/*.ts": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
})
