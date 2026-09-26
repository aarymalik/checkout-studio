import { fileURLToPath } from "node:url"
import { mergeConfig } from "vitest/config"
import { createVitestConfig } from "@checkout-studio/config/vitest/base"

export default mergeConfig(
  createVitestConfig({
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Mirrors the "@/*" path alias in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  }),
  {
    // Next compiles JSX itself, so this app's tsconfig leaves it untransformed
    // ("jsx": "preserve"). Vitest has no Next compiler behind it and needs to be
    // told, or every .tsx file in the app fails to parse. Vite 8 transforms with
    // Oxc rather than esbuild, so the setting lives here.
    oxc: { jsx: { runtime: "automatic" as const } },
  },
)
