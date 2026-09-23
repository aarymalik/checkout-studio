import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createVitestConfig } from "@checkout-studio/config/vitest/base"

/**
 * Integration tests run against a real PostgreSQL database — a separate one
 * from development, so a test run can never destroy work.
 *
 * The workspace environment file is loaded here because Vitest does not read
 * it, and the database client requires DATABASE_URL to exist.
 */
const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url))
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

const testDatabaseUrl =
  process.env["TEST_DATABASE_URL"] ??
  (process.env["DATABASE_URL"] ?? "").replace(/\/[^/?]+(\?|$)/, "/checkout_studio_test_database$1")

export default createVitestConfig({
  environment: "node",
  alias: {
    "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
  },
  env: { DATABASE_URL: testDatabaseUrl },
  sequential: true,
  globalSetup: ["./tests/globalTeardown.ts"],
})
