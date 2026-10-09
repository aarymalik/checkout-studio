import { expect, test } from "@playwright/test"
import { defaultTheme } from "@checkout-studio/schema"

import { MOBILE_PADDING, publish, unpublish } from "./support/publish"
import type { Published } from "./support/publish"

/**
 * The published route, end to end.
 *
 * The engine ships no components yet, so every node resolves to the unsupported
 * fallback — which on a published page renders an empty box that keeps its
 * space. That is the correct behaviour and exactly what should be asserted: a
 * page with no components installed still serves valid, styled HTML rather than
 * failing.
 */

let published: Published

test.beforeAll(async () => {
  published = await publish("page")
})

test.afterAll(async () => {
  await unpublish(published)
})

test("serves a published checkout", async ({ page }) => {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })

  await page.goto(`/${published.hostname}/${published.slug}`)

  await expect(page.locator(".checkout-root")).toBeAttached()
  await expect(page).toHaveTitle("Complete your order")

  // The theme's variables are in the document, server-rendered, so nothing
  // paints unstyled.
  const primary = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".checkout-root") as Element).getPropertyValue(
      "--ck-color-primary",
    ),
  )
  // Derived from the theme rather than restated: an assertion that repeated the
  // value would keep passing after somebody changed it.
  expect(primary.trim()).toBe(defaultTheme.colors.primary)

  /*
   * Every node is a real component now, and the words are on the page.
   *
   * `core-layout` registers the page and the section; `core-content` registers
   * the text. So nothing falls back — and the assertion worth making is not
   * that the markup is there but that a customer can read it: this is the
   * first published checkout in this product with content on it.
   */
  await expect(page.locator(".checkout-root main")).toBeVisible()
  await expect(page.locator(".checkout-root main > section")).toBeVisible()
  await expect(page.getByText("Pay now")).toBeVisible()
  await expect(page.locator("[data-ck-unsupported]")).toHaveCount(0)

  // Zero hydration mismatches. React reports one as a recoverable error.
  expect(errors.filter((text) => /hydrat|did not match/i.test(text))).toEqual([])
})

test("the markup is identical at every width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/${published.hostname}/${published.slug}`)
  const wide = await page.locator(".checkout-root").innerHTML()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const narrow = await page.locator(".checkout-root").innerHTML()

  // The server cannot know the visitor's viewport. Breakpoints are media-query
  // CSS, not a different tree — which is what prevents a wrong first paint and
  // a hydration mismatch.
  expect(narrow).toBe(wide)
})

test("the breakpoint styles are media queries, not a second tree", async ({ page }) => {
  await page.goto(`/${published.hostname}/${published.slug}`)

  const css = await page.locator(".checkout-root style").innerText()

  /*
   * The relationship, not the pixel.
   *
   * Which pixel is the breakpoint is pinned by the renderer's own tests. This
   * asserts the narrow override arrives inside a media query rather than as a
   * second tree — and it does so without importing the renderer, whose error
   * boundaries are class components. React's server build has no `Component`,
   * and this process runs with `--conditions=react-server` so it can import
   * the repositories.
   */
  expect(css).toMatch(
    new RegExp(`@media \\(max-width: \\d+px\\) \\{[^}]*padding: ${MOBILE_PADDING}px`),
  )
})

test("serves nothing for a domain nobody published to", async ({ page }) => {
  const response = await page.goto("/nobody.example.test/checkout")

  expect(response?.status()).toBe(404)
})

test("serves nothing for a slug that is not published", async ({ page }) => {
  const response = await page.goto(`/${published.hostname}/not-a-page`)

  expect(response?.status()).toBe(404)
})
