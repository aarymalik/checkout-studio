import globals from "globals"
import { reactConfig } from "./react.js"

/**
 * Next.js application preset.
 *
 * Apps are the only place environment variables may be read, per
 * docs/monorepo-structure.md, and only through their validated env module.
 */
export const nextConfig = [
  ...reactConfig,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read environment variables through the app's validated env module (src/env.ts), never directly.",
        },
      ],
    },
  },
  {
    files: [
      "src/env.ts",
      "next.config.ts",
      "vitest.setup.ts",
      "**/scripts/**",
      "**/*.config.{js,mjs,ts}",
    ],
    rules: { "no-restricted-properties": "off" },
  },
]

export default nextConfig
