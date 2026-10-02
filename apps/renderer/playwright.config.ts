import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"

/**
 * The fixtures publish a page through the same repositories the product uses, so
 * the test process needs the database the server is using. Playwright does not
 * read the workspace environment file, and Next does.
 */
const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url))
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

/*
 * The renderer's own port, which is 3001 unless `PORT` says otherwise — the
 * same default as its `dev` script.
 *
 * Deliberately not derived from `APP_URL`: that names the *studio*, and
 * guessing the renderer's port from it would be a second source of truth that
 * drifts the first time either moves. The studio's config does read it, because
 * there `APP_URL` is the application's own address.
 */
const PORT = Number(process.env["PORT"] ?? 3001)

const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    /*
     * The test process runs with `--conditions=react-server` so it can import
     * the repositories, which declare themselves `server-only` — that package
     * throws unless the condition is set, and Playwright does not set it.
     *
     * The server must not inherit it. Next resolves its own conditions per
     * module graph, and forcing react-server on the whole process takes
     * react-dom/server away from the parts that legitimately need it.
     */
    env: { NODE_OPTIONS: "" },
  },
})
