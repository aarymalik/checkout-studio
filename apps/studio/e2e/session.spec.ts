import { expect, test, type Browser, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, PASSWORD, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * One writer per page, in two real browsers.
 *
 * The only test that can answer the question this feature exists for: what the
 * second tab does. Everything else about the lock — the Redis TTL, the claim
 * race, the heartbeat — is tested in packages/api against a real Redis, and the
 * client's own rules are tested in jsdom. This is the two of them meeting.
 *
 * Two browser contexts rather than two pages in one, because a context is what
 * carries its own cookies and its own session identity, which is what makes
 * them two sessions rather than one tab twice.
 */

let account: Account
let session: Cookie[]

test.beforeAll(async ({ playwright, baseURL }) => {
  account = await createAccount("session")

  const api = await playwright.request.newContext(baseURL === undefined ? {} : { baseURL })
  const response = await api.post("/api/auth/sign-in", {
    data: { email: account.email, password: PASSWORD },
  })

  expect(response.ok(), await response.text()).toBe(true)

  session = (await api.storageState()).cookies
  await api.dispose()
})

test.afterAll(async () => {
  await removeAccount(account)
})

let counter = 0

/** A page of this test's own, so one test's lock is not another's. */
async function freshPage(): Promise<string> {
  counter += 1

  return createPage(account.projectId, {
    title: `Session ${counter}`,
    slug: `session-${counter}`,
    nodes: [{ id: `body_s${counter}`, type: "core.section", name: "Body" }],
  })
}

/** A second browser, signed in as the same person. */
async function secondWindow(browser: Browser, pageId: string): Promise<Page> {
  const context = await browser.newContext()

  await context.addCookies(session)

  const page = await context.newPage()

  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  return page
}

async function open(page: Page, pageId: string): Promise<void> {
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
}

test("the second session opens read-only, and is told where the page is open", async ({
  context,
  browser,
  page,
}) => {
  const pageId = await freshPage()

  await context.addCookies(session)
  await open(page, pageId)

  // The first one holds the page, so it reports on saving rather than on the
  // lock.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  const second = await secondWindow(browser, pageId)

  // Never silently blocked and never silently allowed: it says where the page
  // is open, and offers the way out.
  await expect(second.getByText(/Read only — editing in/)).toBeVisible({ timeout: 15_000 })
  await expect(second.getByRole("button", { name: "Take over" })).toBeVisible()

  await second.context().close()
})

test("the second session cannot change the page it is reading", async ({
  context,
  browser,
  page,
}) => {
  const pageId = await freshPage()

  await context.addCookies(session)
  await open(page, pageId)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  const second = await secondWindow(browser, pageId)

  await expect(second.getByRole("button", { name: "Take over" })).toBeVisible({ timeout: 15_000 })
  await second.getByRole("tab", { name: "Layers" }).click()

  // Full navigation, full tree — and none of the controls that would write.
  await expect(second.getByRole("tree", { name: "Layers" })).toBeVisible()
  await expect(second.getByRole("button", { name: "Body", exact: true })).toBeVisible()
  await expect(second.getByRole("button", { name: "Hide Body" })).toBeHidden()
  await expect(second.getByRole("button", { name: "Lock Body" })).toBeHidden()

  await second.context().close()
})

test("taking over moves the right to write", async ({ context, browser, page }) => {
  const pageId = await freshPage()

  await context.addCookies(session)
  await open(page, pageId)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  const second = await secondWindow(browser, pageId)

  await second.getByRole("button", { name: "Take over" }).click()

  // It holds the page now, so it reports on saving.
  await expect(second.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(second.getByRole("button", { name: "Take over" })).toBeHidden()

  await second.getByRole("tab", { name: "Layers" }).click()
  await expect(second.getByRole("button", { name: "Hide Body" })).toBeAttached()

  await second.context().close()
})

test("a page whose session ended is offered rather than taken", async ({
  context,
  browser,
  page,
}) => {
  /*
   * The slow one, and unavoidably.
   *
   * The read-only session finds out on the same thirty-second interval the
   * heartbeat uses, because there is no channel that could tell it sooner. So
   * this needs longer than the default thirty-second budget for the whole test.
   *
   * The rule itself — offered, not taken — is covered with fake timers in
   * EditSessionProvider.test.tsx. What only two real browsers can show is that
   * the first one's release is what frees the page.
   */
  test.setTimeout(120_000)

  const pageId = await freshPage()

  await context.addCookies(session)
  await open(page, pageId)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  const second = await secondWindow(browser, pageId)

  await expect(second.getByRole("button", { name: "Take over" })).toBeVisible({ timeout: 15_000 })

  // The holder goes away, which releases the lock on the way out.
  await page.close()

  /*
   * Offered, not taken.
   *
   * Somebody reading a page should not start holding its lock because the other
   * tab closed. The poll is on the heartbeat interval, so this waits one.
   */
  await expect(second.getByRole("button", { name: "Start editing" })).toBeVisible({
    timeout: 45_000,
  })
  await expect(second.getByText(/the other session ended/)).toBeVisible()

  await second.getByRole("button", { name: "Start editing" }).click()
  await expect(second.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 })

  await second.context().close()
})

test("reloading does not lock somebody out of their own page", async ({ context, page }) => {
  const pageId = await freshPage()

  await context.addCookies(session)
  await open(page, pageId)
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()

  // A reload is a new session id against a lock the old one still holds for
  // ninety seconds. Re-claiming has to refresh it rather than refuse.
  await open(page, pageId)

  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await expect(page.getByText(/Read only/)).toBeHidden()
})
