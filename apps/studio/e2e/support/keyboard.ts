import type { Page } from "@playwright/test"

/**
 * The modifier this application believes in.
 *
 * **Not `ControlOrMeta`.** Playwright resolves that by the operating system the
 * test runs on; the application resolves `mod` by what the *browser* reports
 * about itself, through `sec-ch-ua-platform` and then the user agent.
 * Playwright's bundled Chromium reports Windows even on a Mac, so the two
 * disagree — and a `ControlOrMeta` shortcut then silently does nothing, which
 * reads exactly like a broken binding.
 *
 * ## Why the rule is copied rather than imported
 *
 * `platformFor` in packages/editor is the source of truth, and importing it
 * means importing the editor's barrel — which is React client code, and this
 * suite runs under `--conditions=react-server` so that it can reach the
 * repositories. `createContext` is not exported under that condition, so the
 * import fails before any test runs.
 *
 * The rule is one regular expression and it is reproduced here with that
 * pointer. If it ever changes, the shortcut tests are what notice.
 */
export async function modifier(page: Page): Promise<"Meta" | "Control"> {
  const userAgent = await page.evaluate(() => navigator.userAgent)

  // Mirrors platformFor in packages/editor/src/keyboard/normalize.ts.
  return /mac|iphone|ipad|ipod/i.test(userAgent) ? "Meta" : "Control"
}
