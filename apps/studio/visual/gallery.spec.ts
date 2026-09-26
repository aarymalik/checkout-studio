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

      await expect(page).toHaveScreenshot(`${testCase.id}-${colorScheme}.png`, {
        fullPage: true,
      })
    })
  }
}
