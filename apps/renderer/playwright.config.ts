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
 * The port this application believes it is on — `PORT`, then `APP_URL`'s, then
 * the default. Same order as the studio's, and for the same reason: a suite
 * pointed at a port something else holds asserts against the wrong server.
 *
 * The renderer's own port is one past the studio's, since `APP_URL` names the
 * studio.
 */
const PORT = Number(process.env["PORT"] ?? next(process.env["APP_URL"]) ?? 3001)

function next(url: string | undefined): number | null {
  if (url === undefined || url === "") return null

  try {
    const { port } = new URL(url)

    return port === "" ? null : Number(port) + 1
  } catch {
    return null
  }
}
// localhost, not 127.0.0.1. Next binds localhost, and it withholds part of the
// client runtime to a cross-origin request — so a suite that visits the loopback
// address photographs a page that never hydrated. Learned in Phase 4.
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
