import type { ViteUserConfig } from "vitest/config"

export interface CoverageThresholds {
  statements: number
  branches: number
  functions: number
  lines: number
}

/**
 * Thresholds, optionally raised for a subset of files.
 *
 * A glob key carries its own thresholds, which is how a critical module is held
 * to 100% without raising the floor for everything around it.
 */
export type ScopedThresholds = CoverageThresholds & {
  [glob: string]: CoverageThresholds | number
}

export declare const coverageThresholds: CoverageThresholds

export declare function createVitestConfig(options?: {
  environment?: "node" | "jsdom"
  setupFiles?: string[]
  thresholds?: ScopedThresholds
  coverageInclude?: string[]
  alias?: Record<string, string>
  env?: Record<string, string>
  /** Run test files one at a time — for suites sharing a database. */
  sequential?: boolean
  /** Modules that set up and tear down shared connections once per run. */
  globalSetup?: string[]
}): ViteUserConfig

export default createVitestConfig
