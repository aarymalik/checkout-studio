import { defineConfig } from "vitest/config"

/**
 * Coverage thresholds are the floor from docs/testing.md. Critical modules
 * raise them to 100% in their own config; nothing lowers them.
 */
export const coverageThresholds = {
  statements: 90,
  branches: 85,
  functions: 90,
  lines: 90,
}

/**
 * Coverage thresholds, optionally raised for a subset of files.
 *
 * A glob key holds its own thresholds, which is how a critical module is held
 * to 100% without raising the floor for everything around it.
 *
 * @typedef {typeof coverageThresholds} Thresholds
 * @typedef {Thresholds & { [glob: string]: Thresholds | number }} ScopedThresholds
 */

/**
 * @param {{
 *   environment?: "node" | "jsdom",
 *   setupFiles?: string[],
 *   thresholds?: ScopedThresholds,
 *   coverageInclude?: string[],
 *   alias?: Record<string, string>,
 *   env?: Record<string, string>,
 *   sequential?: boolean,
 *   globalSetup?: string[],
 * }} [options]
 */
export function createVitestConfig(options = {}) {
  const { environment = "node", setupFiles = [], thresholds = coverageThresholds } = options

  return defineConfig({
    resolve: options.alias ? { alias: options.alias } : {},
    test: {
      environment,
      setupFiles,
      ...(options.env ? { env: options.env } : {}),
      // Integration tests that share one database must not run in parallel:
      // one file's cleanup would wipe another file's fixtures mid-test.
      ...(options.sequential ? { fileParallelism: false, maxWorkers: 1 } : {}),
      // One worker per package in CI.
      //
      // Turbo runs several packages' suites at once, and each vitest pool sizes
      // itself to the machine's cores — so sixteen packages on a two-core runner
      // oversubscribe it by an order of magnitude. A shell test that takes
      // 116ms on a laptop took five seconds there and failed on the default
      // timeout, which measured the contention rather than the code.
      //
      // Packages still run in parallel; each is just no longer trying to use
      // the whole machine.
      ...(process.env["CI"] && !options.sequential ? { maxWorkers: 1 } : {}),
      ...(options.globalSetup ? { globalSetup: options.globalSetup } : {}),
      include: ["src/**/*.test.{ts,tsx,js}", "tests/**/*.test.{ts,tsx,js}"],
      passWithNoTests: true,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: options.coverageInclude ?? ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}", "src/**/index.ts", "src/**/*.d.ts"],
        thresholds,
      },
    },
  })
}

export default createVitestConfig
