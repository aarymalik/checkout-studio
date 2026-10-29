import { fileURLToPath } from "node:url"
import { mergeConfig } from "vitest/config"
import { createVitestConfig } from "@checkout-studio/config/vitest/base"

export default mergeConfig(
  createVitestConfig({
    environment: "jsdom",
    // A route handler's test provokes failures on purpose, and each one logs
    // its error. Matches packages/api.
    env: { LOG_LEVEL: "fatal" },
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      // Mirrors the "@/*" path alias in tsconfig.json.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // jsdom looks like a client to `server-only`, so a route handler's test
      // would fail on the import. See tests/stubs/server-only.ts.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  }),
  {
    // Next compiles JSX itself, so this app's tsconfig leaves it untransformed
    // ("jsx": "preserve"). Vitest has no Next compiler behind it and needs to be
    // told, or every .tsx file in the app fails to parse. Vite 8 transforms with
    // Oxc rather than esbuild, so the setting lives here.
    oxc: { jsx: { runtime: "automatic" as const } },
  },
)
