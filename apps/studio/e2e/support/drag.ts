import { expect, type Page } from "@playwright/test"

/**
 * Starts a drag, and does not return until the engine has the pointer.
 *
 * ## The window this closes
 *
 * `waitForHydration` waits for React's container marker and for nothing to
 * say it is busy. `pressUntil` already documents what that still misses:
 * the shell's listeners are attached in effects, which run after the
 * marker, and "a global listener leaves no trace" — so there is a window
 * where the page looks ready and swallows input.
 *
 * The canvas takes its pointer handlers the same way. A `mouse.down()`
 * landing in that window is swallowed, no drag begins, and the assertion
 * that follows waits five seconds for an indicator that was never going to
 * appear. On a busy CI runner that window is wide enough to hit, which is
 * what `drag.spec.ts` was doing: passing everywhere, failing on the first
 * run of a merge and passing on the re-run.
 *
 * ## Why a retry rather than a longer wait
 *
 * There is nothing to wait for. The listener's arrival changes no DOM, so
 * a timeout can only be a guess, and a guess long enough for a loaded
 * runner is dead time on every other run.
 *
 * So this gates on the behaviour, which is `pressUntil`'s approach: press,
 * nudge, look for the preview, and if the engine did not take the pointer,
 * release and try again. A release with the pointer still at its origin
 * drops nothing — when the drag never started there is no drag to end, and
 * the attempt costs a click on a node that was about to be picked up
 * anyway.
 *
 * ## It still fails when the product is broken
 *
 * That is the whole point of retrying the gesture rather than sleeping
 * through the problem. A drag engine that genuinely never shows a preview
 * exhausts every attempt and fails, naming what it waited for.
 */

/** Enough to outlast a slow hydration, few enough to fail in seconds. */
const ATTEMPTS = 5

/** Far enough to pass any drag threshold, near enough to stay on the node. */
const NUDGE = 6

export async function startDrag(page: Page, from: { x: number; y: number }): Promise<void> {
  const preview = page.locator("[data-drag-preview]")

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y + NUDGE, { steps: 2 })

    if ((await preview.count()) > 0) return

    /*
     * Back where it started before releasing, so the release cannot land
     * as a drop somewhere else on the rare occasion the engine took the
     * pointer between the check and this line.
     */
    await page.mouse.move(from.x, from.y)
    await page.mouse.up()
  }

  // Deliberately an assertion rather than a throw: it reports what it was
  // waiting for and attaches the page, which a bare Error does not.
  await expect(preview, `no drag began after ${String(ATTEMPTS)} attempts`).toHaveCount(1)
}
