import type { ViteUserConfig } from "vitest/config"

export interface CoverageThresholds {
  statements: number
  branches: number
  functions: number
  lines: number
}

export declare const coverageThresholds: CoverageThresholds

export declare function createVitestConfig(options?: {
  environment?: "node" | "jsdom"
  setupFiles?: string[]
  thresholds?: CoverageThresholds
  coverageInclude?: string[]
  alias?: Record<string, string>
  env?: Record<string, string>
  /** Run test files one at a time — for suites sharing a database. */
  sequential?: boolean
  /** Modules that set up and tear down shared connections once per run. */
  globalSetup?: string[]
}): ViteUserConfig

export default createVitestConfig
