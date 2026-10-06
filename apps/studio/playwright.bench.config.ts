import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"

/*
 * The server validates its environment at startup, and Playwright does not read
 * the workspace file that supplies it. Loaded here so `next start` inherits it,
 * the same way the end-to-end config does.
 */
const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url))
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

/**
 * The canvas benchmark.
 *
 * Separate from the other two suites because it fails for a third reason: a
 * behavioural test fails when the product is wrong, a visual one when it merely
 * looks different, and this one when it got slower. Mixing them makes a red
 * build ambiguous.
 *
 * One worker and no retries. A benchmark sharing cores with another benchmark
 * measures the contention, and a measurement that passes on its second attempt
 * is not a measurement.
 */
const PORT = Number(process.env["PORT"] ?? 3200)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./bench",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env["CI"]),
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    // A fixed window, because the numbers depend on how much is on screen.
    viewport: { width: 1_440, height: 900 },
  },
  webServer: {
    /*
     * A production build, not the dev server.
     *
     * Development mode ships React in development, which double-renders every
     * component and keeps the machinery for warnings and hot reload. Measuring
     * that and calling it the product's performance would be measuring the
     * wrong binary — and flattering or damning it by a factor nobody can
     * predict.
     */
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
    timeout: 300_000,
    /*
     * Extended, not replaced.
     *
     * Passing `env` at all overrides the whole environment rather than adding
     * to it, so the first version of this started a server with none of the
     * variables it validates at boot and timed out waiting for a process that
     * had already exited.
     *
     * `NODE_ENV` is deliberately not production: the bench route 404s there,
     * and this still measures the production *build*, which is the thing that
     * matters — development mode ships React in development, double-renders
     * every component, and would flatter or damn the numbers by a factor
     * nobody can predict.
     */
    env: { ...process.env, NODE_ENV: "test" } as Record<string, string>,
  },
})
