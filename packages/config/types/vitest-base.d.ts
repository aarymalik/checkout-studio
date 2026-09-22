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
}): ViteUserConfig

export default createVitestConfig
