import { writeEmbedOrigins } from "@checkout-studio/cache"
import { expect, test } from "@playwright/test"

import { framer, loaderFramer } from "./support/framer"
import type { Framer } from "./support/framer"
import { publish, unpublish } from "./support/publish"
import type { Published } from "./support/publish"

/**
 * Whether a browser actually refuses to frame the checkout.
 *
 * Everything before this proves we emit a `frame-ancestors` header saying
 * what we meant. This asks the other question — does Chromium agree — and
 * it is the only test that would catch a policy that is syntactically fine
 * and semantically wrong.
 *
 * ## Two real origins
 *
 * Each case serves the merchant's page from its own loopback port, and only
 * one of those ports is registered against the checkout. Both servers are
 * real; see `support/framer.ts` for why an intercepted navigation cannot be
 * used here.
 *
 * ## The allowlist is seeded, not registered
 *
 * `registerOrigin` refuses `http:`, correctly — a live embed is https or
 * nothing. These run over http, so the cache is written directly. What is
 * under test is the browser's enforcement of the header; the service's own
 * refusals are covered where they are decided.
 */

const embedUrl = (pageId: string): string => `http://localhost:3001/embed/${pageId}`

let published: Published
let allowed: Framer
let stranger: Framer

test.beforeAll(async () => {
  published = await publish("embed")

  allowed = await framer(embedUrl(published.pageId))
  stranger = await framer(embedUrl(published.pageId))

  await writeEmbedOrigins(published.pageId, [allowed.origin])

  /*
   * Fetched once before anything is framed, for two reasons. It compiles the
   * route — these run against `next dev`, where the first request to a route
   * builds it, and a framed load racing a compile fails on a timeout that
   * looks exactly like a blocked frame. And it asserts the precondition, so
   * a checkout that does not serve at all is reported as that rather than as
   * a framing failure.
   */
  const warm = await fetch(embedUrl(published.pageId))

  expect(warm.status).toBe(200)
  expect(warm.headers.get("content-security-policy")).toBe(`frame-ancestors ${allowed.origin}`)
})

test.afterAll(async () => {
  await Promise.all([allowed.close(), stranger.close()])
  await writeEmbedOrigins(published.pageId, [])
  await unpublish(published)
})

test("renders inside a page served from a registered origin", async ({ page }) => {
  const failures: string[] = []

  page.on("requestfailed", (request) => failures.push(request.failure()?.errorText ?? "failed"))

  await page.goto(allowed.origin)

  // Reached through the frame, so this passes only if the browser let the
  // document load and render inside it.
  await expect(page.frameLocator("#checkout").locator(".checkout-root")).toBeAttached()
  expect(failures).toEqual([])
})

test("is refused inside a page served from an origin nobody registered", async ({ page }) => {
  const refusals: string[] = []

  page.on("console", (message) => {
    if (message.type() === "error") refusals.push(message.text())
  })

  await page.goto(stranger.origin)

  /*
   * Two assertions, because either alone can lie. An empty frame could mean
   * the checkout simply failed to render, and a console error could appear
   * while it rendered anyway.
   *
   * The message is matched on `ancestor` specifically. Anything vaguer would
   * also match a frame Chrome blocked for its own reasons — which is how the
   * first version of this test passed while Local Network Access, not our
   * header, was doing the refusing.
   */
  await expect(page.frameLocator("#checkout").locator(".checkout-root")).not.toBeAttached()
  await expect.poll(() => refusals.some((text) => /ancestor/iu.test(text))).toBe(true)
})

test.describe("the loader a merchant pastes", () => {
  let host: Framer

  test.beforeAll(async () => {
    host = await loaderFramer("http://localhost:3001/embed.js", published.pageId)
    await writeEmbedOrigins(published.pageId, [allowed.origin, host.origin])
  })

  test.afterAll(async () => {
    await host.close()
    await writeEmbedOrigins(published.pageId, [allowed.origin])
  })

  test("builds the frame itself and sizes it to the checkout", async ({ page }) => {
    await page.goto(host.origin)

    const frame = page.locator("iframe[title='Checkout']")

    // Written by the script, not by the test. A hand-written iframe would
    // never catch the loader pointing at the wrong place.
    await expect(frame).toHaveAttribute("src", `http://localhost:3001/embed/${published.pageId}`)
    await expect(frame).toHaveAttribute("allow", "payment")
    await expect(
      page.frameLocator("iframe[title='Checkout']").locator(".checkout-root"),
    ).toBeAttached()

    /*
     * The whole channel, asserted against a number the page produced rather
     * than one written here: the frame measured its own content, posted the
     * height to the ancestor's origin, and the loader applied it.
     *
     * `120` is the loader's floor, and this fixture's checkout is shorter
     * than that. Comparing against the floor rather than against "anything
     * but the default" is what makes this fail if a message arrives saying
     * the wrong thing, instead of only if none arrives at all.
     */
    const content = await page
      .frameLocator("iframe[title='Checkout']")
      .locator("body")
      .evaluate((body) => body.scrollHeight)

    await expect
      .poll(async () => frame.evaluate((node: HTMLElement) => node.style.height))
      .toBe(`${String(Math.max(content, 120))}px`)
  })

  test("says in the page when the origin is not registered", async ({ page }) => {
    /*
     * Its own checkout and its own host, registered to neither. Reusing the
     * one above would mean asking the browser to block a URL it had just
     * loaded successfully, and it answers that from cache — which is how
     * this test first passed the wrong way round, by finding no notice
     * because there was nothing to report.
     */
    const other = await publish("embed-unregistered")
    const uninvited = await loaderFramer("http://localhost:3001/embed.js", other.pageId)

    await writeEmbedOrigins(other.pageId, ["http://127.0.0.1:1"])

    try {
      await page.goto(uninvited.origin)

      /*
       * A blocked frame is a blank rectangle and a console line nobody has
       * open. The notice names the origin that has to be registered, which
       * is the string a merchant would otherwise have to guess.
       */
      // Matched by attribute rather than by role: `getByRole("alert")` does
      // not resolve this element, and a notice that is in the page is in the
      // page whatever the accessibility tree makes of it.
      await expect(page.locator('[role="alert"]')).toContainText(uninvited.origin, {
        timeout: 20_000,
      })
    } finally {
      await uninvited.close()
      await writeEmbedOrigins(other.pageId, [])
      await unpublish(other)
    }
  })
})
