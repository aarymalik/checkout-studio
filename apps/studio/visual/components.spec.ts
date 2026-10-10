import { expect, test } from "@playwright/test"
import { FRAME_WIDTH } from "@checkout-studio/editor"

import { COMPONENT_CASES } from "../src/app/design/components/cases"

/**
 * Every plugin component, at every breakpoint, light and dark.
 *
 * Phase 9's visual requirement, and the sibling of gallery.spec.ts — that one
 * photographs the studio's interface, this one photographs what a document is
 * made of. The cases come from the gallery itself so the two cannot disagree,
 * and a test beside them asserts that every type the registry holds appears in
 * one.
 *
 * The widths are the editor's own frame sizes rather than numbers invented
 * here, so a photograph is taken at the width a user was designing for.
 * Responsive styles reach a published page as media queries, so setting the
 * viewport is what actually exercises them — a `breakpoint` prop would test
 * the editor's single-breakpoint path instead, which is not what a customer
 * loads.
 */

const WIDTHS = Object.entries(FRAME_WIDTH) as readonly [keyof typeof FRAME_WIDTH, number][]

for (const testCase of COMPONENT_CASES) {
  for (const [breakpoint, width] of WIDTHS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${testCase.id} — ${breakpoint} — ${colorScheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme })
        /*
         * `chrome=0` drops the gallery's own list, which is 256px of the page
         * and would leave a component 134px of a 390px frame. `mode` tells the
         * renderer which half of the theme to emit — it does not read a media
         * query, so without it every dark screenshot here was a light checkout
         * on dark chrome.
         */
        await page.goto(`/design/components?case=${testCase.id}&mode=${colorScheme}&chrome=0`)

        // The pre-paint script resolves the theme before anything paints, so
        // the attribute is the signal that the page is ready to be
        // photographed.
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme)

        // Fonts settle after the first paint, and half-loaded text is a
        // different picture every run.
        await page.evaluate(() => document.fonts.ready)

        await expect(page.locator(`[data-case="${testCase.id}"]`)).toBeVisible()

        /*
         * Next's development indicator is not part of the design system, and
         * it moves and restyles between framework releases — a Next upgrade
         * would otherwise fail every screenshot at once. Removed rather than
         * masked: it renders inside a shadow root, so Playwright's `mask`
         * silently covers nothing.
         */
        await page.evaluate(() => {
          document.querySelector("nextjs-portal")?.remove()
        })

        await expect(page).toHaveScreenshot(
          `component-${testCase.id}-${breakpoint}-${colorScheme}.png`,
          { fullPage: true },
        )
      })
    }
  }
}
