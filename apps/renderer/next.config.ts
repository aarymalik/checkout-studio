import type { NextConfig } from "next"

/**
 * The published checkout ships no editor code and no Studio UI. The package
 * list below is the enforcement of that at build time, and it is deliberately
 * short — see the renderer's bundle budget in docs/performance.md.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@checkout-studio/database",
    "@checkout-studio/cache",
    "@checkout-studio/api",
    "@checkout-studio/observability",
    "@checkout-studio/renderer",
    "@checkout-studio/schema",
    "@checkout-studio/types",
    "@checkout-studio/utils",
  ],
}

export default nextConfig
