import type { NextConfig } from "next"

/**
 * Workspace packages are consumed as TypeScript source, per
 * docs/monorepo-structure.md, so Next compiles them alongside the app.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@checkout-studio/editor",
    "@checkout-studio/hooks",
    "@checkout-studio/observability",
    "@checkout-studio/renderer",
    "@checkout-studio/schema",
    "@checkout-studio/types",
    "@checkout-studio/ui",
    "@checkout-studio/utils",
  ],
}

export default nextConfig
