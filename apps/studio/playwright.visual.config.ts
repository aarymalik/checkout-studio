import { defineConfig, devices } from "@playwright/test"

/**
 * The visual suite.
 *
 * Separate from the end-to-end config because it answers a different question
 * and fails for different reasons: a behavioural test fails when the product is
 * wrong, a visual one fails when it merely looks different, and mixing them
 * makes a red build ambiguous.
 *
 * One browser, one device scale, no retries. A screenshot that passes on the
 * second attempt is a screenshot nobody can trust.
 */
const PORT = Number(process.env["PORT"] ?? 3100)
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: "./visual",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  reporter: process.env["CI"] ? "github" : "list",
  /*
   * Baselines are per platform.
   *
   * A screenshot taken on macOS does not match one taken on Linux: the text
   * rasterises differently. The path keeps them apart so a developer's local
   * run cannot overwrite the ones CI compares against.
   */
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{arg}{ext}",
  use: {
    baseURL,
    // One scale everywhere. A retina baseline and a non-retina run differ in
    // every pixel.
    deviceScaleFactor: 1,
    viewport: { width: 1280, height: 900 },
  },
  expect: {
    toHaveScreenshot: {
      // Animations are frozen at their first frame; without this a spinner is a
      // different picture every run.
      animations: "disabled",
      // Room for a single-pixel antialiasing difference, and no more.
      maxDiffPixelRatio: 0.002,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The gallery exists only outside production, so the suite runs against a
    // development server by design.
    command: `pnpm exec next dev --port ${PORT}`,
    url: `${baseURL}/design`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
})
