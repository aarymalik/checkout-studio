import type { Page } from "@playwright/test"

/**
 * Waits until React has taken over the page.
 *
 * A keystroke or a click that lands before hydration is simply lost: the markup
 * is there, the handlers are not. Without this, a test races the client bundle
 * and fails on a machine that happens to be busy — which is the worst kind of
 * flake, because it looks like the feature.
 *
 * React marks the container it hydrated, which is `document` for the App Router.
 * That marker is the closest thing to a hydration event the browser offers.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Object.keys(document).some((key) => key.startsWith("__reactContainer$")),
  )
}
