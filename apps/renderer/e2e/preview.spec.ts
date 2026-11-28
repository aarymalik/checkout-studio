import { issuePreview, revokePreview } from "@checkout-studio/api"
import { expect, test } from "@playwright/test"

import { publish, unpublish } from "./support/publish"
import type { Published } from "./support/publish"

/**
 * A draft, shown to somebody holding a link.
 *
 * The unit tests prove a token redeems. What is only true here is that a
 * browser asking for the URL gets the page — and, for every way a link can
 * be dead, that it gets the same nothing.
 */

let published: Published

function link(token: string): string {
  return `/preview/${encodeURIComponent(token)}`
}

test.beforeAll(async () => {
  published = await publish("preview")
})

test.afterAll(async () => {
  await unpublish(published)
})

test("shows the draft to somebody holding the link", async ({ page }) => {
  const issued = await issuePreview(
    { userId: published.userId, projectId: published.projectId },
    { pageId: published.pageId },
  )

  if (!issued.ok) throw new Error("the fixture did not issue a link")

  await page.goto(link(issued.preview.token))

  await expect(page.locator(".checkout-root")).toBeAttached()
})

test("is not indexed", async ({ page }) => {
  const issued = await issuePreview(
    { userId: published.userId, projectId: published.projectId },
    { pageId: published.pageId },
  )

  if (!issued.ok) throw new Error("the fixture did not issue a link")

  await page.goto(link(issued.preview.token))

  /*
   * A preview URL in a search result is an unfinished checkout reachable
   * by anybody who finds it, with the secret that was meant to be private
   * sitting in the result.
   *
   * Caching is asserted in `preview-route.test.ts` rather than here: a
   * development server answers `no-store` whatever the route says, so a
   * header assertion against it passes with the route's own opt-out
   * deleted — which is exactly what it did.
   */
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u)
})

test("is nothing once the link is revoked", async ({ page }) => {
  const issued = await issuePreview(
    { userId: published.userId, projectId: published.projectId },
    { pageId: published.pageId },
  )

  if (!issued.ok) throw new Error("the fixture did not issue a link")

  await revokePreview({ userId: published.userId }, issued.preview.id)

  const response = await page.goto(link(issued.preview.token))

  expect(response?.status()).toBe(404)
})

test("is nothing for a token nobody issued", async ({ page }) => {
  const response = await page.goto(link("a-token-nobody-issued"))

  // The same answer as a revoked one, so guessing teaches nothing.
  expect(response?.status()).toBe(404)
})
