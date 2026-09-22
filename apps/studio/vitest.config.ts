import { fileURLToPath } from "node:url"
import { createVitestConfig } from "@checkout-studio/config/vitest/base"

export default createVitestConfig({
  environment: "jsdom",
  setupFiles: ["./vitest.setup.ts"],
  // Mirrors the "@/*" path alias in tsconfig.json.
  alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
})
