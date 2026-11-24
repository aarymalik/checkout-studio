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
    "@checkout-studio/plugin-sdk",
    "@checkout-studio/renderer",
    "@checkout-studio/schema",
    "@checkout-studio/types",
    "@checkout-studio/utils",
  ],

  /**
   * How long a merchant's browser keeps the loader.
   *
   * The two paths are cached oppositely on purpose, and that difference is
   * the whole of what pinning means.
   *
   * A frozen build never changes — a test fails if it does — so it is held
   * forever and a merchant who pinned one pays for it once.
   *
   * The living loader is the path a fix travels down, so it is held for
   * five minutes. Long enough that a busy checkout is not refetching it per
   * visitor, short enough that a security fix reaches the web in minutes
   * rather than whenever a cache felt like expiring.
   */
  async headers() {
    return [
      {
        source: "/embed/:file*",
        headers: [{ key: "cache-control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/embed.js",
        headers: [{ key: "cache-control", value: "public, max-age=300" }],
      },
    ]
  },
}

export default nextConfig
