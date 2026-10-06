import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createVitestConfig } from "@checkout-studio/config/vitest/base"

const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url))
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

const databaseUrl = (process.env["DATABASE_URL"] ?? "").replace(
  /\/[^/?]+(\?|$)/,
  "/checkout_studio_test_api$1",
)

export default createVitestConfig({
  environment: "node",
  alias: {
    "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
  },
  env: {
    LOG_LEVEL: "fatal",
    DATABASE_URL: databaseUrl,
    REDIS_URL: `${process.env["REDIS_URL"] ?? "redis://localhost:6379"}/14`,
  },
  sequential: true,
  // A real server over a socket, so the limit allows for a loaded machine. See
  // the note in @checkout-studio/config/vitest/base.
  timeout: 30_000,
  globalSetup: ["./tests/globalTeardown.ts"],
})
