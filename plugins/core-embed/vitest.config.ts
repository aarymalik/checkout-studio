import { fileURLToPath } from "node:url"
import { createVitestConfig } from "@checkout-studio/config/vitest/base"

export default createVitestConfig({
  environment: "jsdom",
  setupFiles: [fileURLToPath(new URL("./tests/setup.ts", import.meta.url))],
})
