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
    /*
     * The state engine, likewise, per docs/phases.md Phase 5.
     *
     * Every branch here decides what happens to somebody's page. An untested
     * one is a way to lose work, and the first anyone would know is a document
     * that no longer matches what they built.
     */
    "src/state/*.ts": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    /*
     * Collision and validity, per docs/phases.md Phase 8.
     *
     * The rules that decide whether a drag may land somewhere. A wrong answer
     * here is either a drop the user was promised and did not get, or a tree
     * that should have been impossible — and both are decided by arithmetic
     * that no test in a browser would pin down as precisely.
     */
    "src/dnd/*.ts": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
})
