import { expect, test } from "@playwright/test"

import { INSPECTOR_CASES } from "../src/app/design/inspector/cases"

/**
 * The inspector, photographed.
 *
 * ## Why this suite exists
 *
 * Two alignment faults shipped in a row — a unit picker beside a labelled
 * stack rather than its input, and a unit picker level with the letters under
 * four boxes rather than the boxes. Neither was catchable by a test: jsdom has
 * no layout, so the editor's eleven hundred tests passed through both. Both
 * were found by somebody looking at the screen.
 *
 * A third fault was worse and the same shape: a class used only in
 * `packages/editor` produced no CSS at all, so a four-column grid rendered as
 * four stacked blocks. Nothing failed anywhere.
 *
 * ## One width, two modes
 *
 * The panel is a fixed-width column and does not reflow, so three breakpoints
 * would be three copies of one picture. Light and dark both, because a token
 * row and a muted description are the two things most likely to disappear into
 * a background.
 */
for (const testCase of INSPECTOR_CASES) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${testCase.id} — ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 1200 })
      await page.emulateMedia({ colorScheme })

      await page.goto(`/design/inspector?case=${testCase.id}&chrome=0`)

      // The pre-paint script resolves the theme before anything paints.
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme)

      // Fonts settle after the first paint, and half-loaded text is a
      // different picture every run.
      await page.evaluate(() => document.fonts.ready)

      await expect(page.locator(`[data-case="${testCase.id}"]`)).toBeVisible()

      /*
       * The panel keeps one section open at a time, so the section a case is
       * about has to be asked for. Opened by clicking its header rather than
       * by a prop the product does not have: what is photographed is then the
       * panel a merchant can actually get to.
       */
      if (testCase.section !== undefined) {
        await page.getByRole("button", { name: testCase.section }).click()
        await expect(page.getByRole("region", { name: testCase.section })).toBeVisible()
      }

      /*
       * Typed rather than handed in as a prop. The query belongs to the panel,
       * the way the open section does, and a gallery that reached past the
       * field to set it would be photographing a state the product cannot
       * reach.
       */
      if (testCase.search !== undefined) {
        await page.getByRole("searchbox", { name: "Search properties" }).fill(testCase.search)
      }

      /*
       * Next's development indicator is not part of the design system, and it
       * moves between framework releases. Removed rather than masked: it
       * renders inside a shadow root, which Playwright's `mask` cannot reach.
       */
      await page.evaluate(() => {
        document.querySelector("nextjs-portal")?.remove()
      })

      await expect(page).toHaveScreenshot(`inspector-${testCase.id}-${colorScheme}.png`, {
        fullPage: true,
        /*
         * Two dozen pixels, where the rest of the suite allows two in a
         * thousand — 1152 on an image this size.
         *
         * That allowance is for a page of product, where a hairline of
         * antialiasing on a shadow is not a regression. Here it was enough to
         * hide a whole word: fixing a select that read "Select…" over a
         * heading whose level was plainly 2 changed the panel to read
         * "Heading 2", and the suite went on passing against the old picture.
         *
         * This was zero for three slices, which was too strict by exactly one
         * hairline. Two CI runs of identical code differed by **four pixels**,
         * all of them at x=160 — the panel's one-pixel left border — with a
         * largest channel delta of 39. Sub-pixel antialiasing on a vertical
         * line, and not something any threshold should be chasing.
         *
         * Twenty-four is six times that noise and well under the smallest
         * change worth catching: one character of body text is roughly a
         * hundred pixels of glyph, of which forty or so differ when the
         * character changes. A word still fails. A hairline no longer does.
         */
        maxDiffPixels: 24,
      })
    })
  }
}
