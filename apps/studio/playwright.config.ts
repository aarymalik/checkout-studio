import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"

/**
 * The fixtures create their account through the same repositories the product
 * uses, so the test process needs the same database the server is using.
 * Playwright does not read the workspace environment file, and Next does.
 */
const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url))
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

/*
 * The port this application believes it is on.
 *
 * `PORT`, then the port in `APP_URL`, then the default — the same order
 * scripts/dev.mjs uses, and for the same reason: a suite that assumes 3000
 * while the server is on 3002 does not fail, it talks to whatever else is
 * listening there. That is how these tests came to be asserting against an
 * unrelated application's 404 page.
 */
const PORT = Number(process.env["PORT"] ?? portOf(process.env["APP_URL"]) ?? 3000)

function portOf(url: string | undefined): string | null {
  if (url === undefined || url === "") return null

  try {
    const { port } = new URL(url)

    return port === "" ? null : port
  } catch {
    return null
  }
}
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
     * The test process runs with `--conditions=react-server` so that it can
     * import the repositories, which declare themselves `server-only` — that
     * package throws unless the condition is set, and Playwright does not set it.
     *
     * The server must not inherit it. Next resolves its own conditions per
     * module graph, and forcing react-server on the whole process makes
     * react-dom/server unavailable to the parts that legitimately need it.
     */
    env: { NODE_OPTIONS: "" },
  },
})
