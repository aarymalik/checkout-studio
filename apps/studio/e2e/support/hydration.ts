import { expect, type Locator, type Page } from "@playwright/test"

/**
 * Waits until React has taken over the page, and until the page is the real one.
 *
 * A keystroke or a click that lands before hydration is simply lost: the markup
 * is there, the handlers are not. Without this, a test races the client bundle
 * and fails on a machine that happens to be busy — which is the worst kind of
 * flake, because it looks like the feature.
 *
 * React marks the container it hydrated, which is `document` for the App Router.
 *
 * That marker is necessary and not sufficient. A route with a `loading.tsx`
 * streams the skeleton first and swaps the real content in when the server
 * finishes; the marker appears at the start of that, not the end. A test that
 * only waited for it would run against the skeleton — and would mostly pass
 * anyway, because Playwright's assertions retry for five seconds and the swap
 * takes a fraction of one. What fails is any single read that does not retry,
 * such as `boundingBox()`, and it fails by reporting the skeleton's geometry as
 * though it were the page's.
 *
 * So the second gate is the absence of anything still saying it is busy, which
 * every loading fallback in the application declares.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Object.keys(document).some((key) => key.startsWith("__reactContainer$")),
  )

  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}

/**
 * Presses a shortcut until it takes effect.
 *
 * The marker above appears when React starts hydrating; the shell's keyboard
 * listener is attached in an effect, which runs after. Between the two there is
 * a window where the page looks ready and swallows keystrokes, and no DOM change
 * marks its end — a global listener leaves no trace.
 *
 * So the gate is the behaviour rather than a proxy for it. Each press is checked
 * before the next, which matters because these shortcuts toggle: a press that
 * worked is never followed by one that undoes it.
 */
export async function pressUntil(page: Page, keys: string, expected: Locator): Promise<void> {
  await expect
    .poll(async () => {
      if ((await expected.count()) > 0) return true

      await page.keyboard.press(keys)

      return (await expected.count()) > 0
    })
    .toBe(true)
}
