import { expect, test } from "@playwright/test"
import { CASES } from "../src/app/design/cases"

/**
 * Every component, in every variant, in light and dark.
 *
 * The cases come from the gallery itself rather than being described again here,
 * so the two cannot disagree. A unit test asserts that every component the
 * library exports appears in that list, which is what makes this matrix
 * complete rather than merely long.
 */

/**
 * How much of the page around a focused control the crop keeps.
 *
 * Enough for the ring and its offset — which together reach 4px — and enough
 * either side of it to show that the ring ends where it should.
 */
const RING_ROOM = 8

for (const testCase of CASES) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${testCase.id} — ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto(`/design?case=${testCase.id}`)

      // The pre-paint script resolves the theme before anything paints, so the
      // attribute is the signal that the page is ready to be photographed.
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme)

      // Fonts settle after the first paint, and half-loaded text is a different
      // picture every run.
      await page.evaluate(() => document.fonts.ready)

      /*
       * The overlays need React before they exist.
       *
       * A dialog, a menu and the palette all render through a portal that only
       * the client creates. Photographing before hydration photographs an empty
       * page — which is what these baselines were until the suite started
       * visiting a host Next's dev server is willing to hydrate.
       */
      await page.waitForFunction(() =>
        Object.keys(document).some((key) => key.startsWith("__reactContainer$")),
      )

      /*
       * Next's development indicator is not part of the design system, and it
       * moves and restyles between framework releases — a Next upgrade would
       * otherwise fail every screenshot in the suite at once.
       *
       * Removed rather than masked or hidden. It renders inside a shadow root,
       * so the host element has no box and Playwright's `mask` silently covers
       * nothing; and the overlay sets its own display, so a stylesheet rule does
       * not win. Taking the element out is the one approach that is not quietly
       * a no-op.
       */
      await page.evaluate(() => {
        document.querySelector("nextjs-portal")?.remove()
      })

      await expect(page).toHaveScreenshot(`${testCase.id}-${colorScheme}.png`, {
        fullPage: true,
      })

      if (testCase.focus !== undefined) {
        const control = page.locator(testCase.focus).first()

        /*
         * By the keyboard, because `:focus-visible` is the rule being
         * photographed and a programmatic `focus()` does not always satisfy
         * it. Tab from the document rather than clicking, which is what a
         * keyboard user does and what the ring exists for.
         */
        await control.press("Tab")
        await page.keyboard.press("Shift+Tab")

        const box = await control.boundingBox()
        if (box === null) throw new Error(`${testCase.focus} has no box to photograph`)

        /*
         * Cropped to the control, and that is what makes this a test.
         *
         * The full-page shot above cannot see a focus ring. Two pixels around
         * an 83×40 button is about 540 of the page's 990,000, and
         * `maxDiffPixelRatio` allows nearly 2,000 — so deleting the ring from
         * the product passes it. Which I checked, by deleting it: both
         * button-variants screenshots still passed, including the one that
         * exists to watch the ring.
         *
         * Cropped, the same 540 pixels are a tenth of the picture.
         */
        await expect(page).toHaveScreenshot(`${testCase.id}-focus-${colorScheme}.png`, {
          clip: {
            x: box.x - RING_ROOM,
            y: box.y - RING_ROOM,
            width: box.width + RING_ROOM * 2,
            height: box.height + RING_ROOM * 2,
          },
        })
      }
    })
  }
}
