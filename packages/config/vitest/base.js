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
 * @param {{
 *   environment?: "node" | "jsdom",
 *   setupFiles?: string[],
 *   thresholds?: typeof coverageThresholds,
 *   coverageInclude?: string[],
 *   alias?: Record<string, string>,
 * }} [options]
 */
export function createVitestConfig(options = {}) {
  const { environment = "node", setupFiles = [], thresholds = coverageThresholds } = options

  return defineConfig({
    resolve: options.alias ? { alias: options.alias } : {},
    test: {
      environment,
      setupFiles,
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
