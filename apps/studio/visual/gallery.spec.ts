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

      await expect(page).toHaveScreenshot(`${testCase.id}-${colorScheme}.png`, {
        fullPage: true,
        /*
         * Next's development indicator is not part of the design system, and it
         * moves and restyles between framework releases. Masking it keeps a
         * Next upgrade from failing every screenshot at once.
         */
        mask: [page.locator("nextjs-portal")],
      })
    })
  }
}
