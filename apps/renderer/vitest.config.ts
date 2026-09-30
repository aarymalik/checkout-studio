import { fileURLToPath } from "node:url"
import { createVitestConfig } from "@checkout-studio/config/vitest/base"

export default createVitestConfig({
  environment: "jsdom",
  setupFiles: ["./vitest.setup.ts"],
  alias: {
    // Mirrors the "@/*" path alias in tsconfig.json.
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    // `server-only` is a build-time guard with no runtime; the module it points
    // at throws when a client bundle reaches it, and there is no bundle here.
    "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
  },
  env: { LOG_LEVEL: "fatal" },
})
