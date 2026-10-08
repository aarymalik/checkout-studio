import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"
import { prisma } from "@checkout-studio/database"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * A layer row, by the name on it.
 *
 * Scoped to the tree, which it did not need to be until Phase 9. A node's name
 * now appears twice on screen — once here and once in the canvas breadcrumb,
 * which exists because the canvas mounts and something is selected — so an
 * unscoped query resolves to two elements and Playwright refuses it. The
 * duplication is correct: both are places a user reads the name.
 */
function layerRow(page: Page, name: string) {
  return page.getByRole("tree", { name: "Layers" }).getByRole("button", { name, exact: true })
}

/**
 * Autosave, end to end.
 *
 * The engine is tested in packages/editor, the transport and the wiring beside
 * them in the application. What only a real browser and a real database can
 * answer is whether an edit lands in Postgres — and that is the thing that was
 * missing: every piece existed and passed its own tests while nothing connected
 * them, so every edit in the editor was lost on reload.
 *
 * So these read the row rather than the screen.
 *
 * A page each. These tests change the document, and now that the change sticks,
 * sharing one page would make each test depend on what the last one did.
 */

let account: Account
let session: Cookie[]

test.beforeAll(async () => {
  account = await createAccount("autosave")

  session = await signedInCookies(account)
})

test.afterAll(async () => {
  await removeAccount(account)
})

let counter = 0

/** A page of this test's own, opened on the Layers panel. */
async function openPage(context: BrowserContext, page: Page): Promise<string> {
  await context.addCookies(session)

  counter += 1

  const pageId = await createPage(account.projectId, {
    title: `Checkout ${counter}`,
    slug: `checkout-${counter}`,
    nodes: [{ id: `body_${counter}`, type: "core.section", name: "Body" }],
  })

  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
  await page.getByRole("tab", { name: "Layers" }).click()

  return pageId
}

/** The draft as the database holds it, which is the only thing that counts. */
async function stored(pageId: string): Promise<{ version: number; names: readonly string[] }> {
  const row = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    select: { draftSchema: true, draftVersion: true },
  })

  const schema = row.draftSchema as { nodes: Record<string, { metadata?: { name?: string } }> }

  return {
    version: row.draftVersion,
    names: Object.values(schema.nodes)
      .map((node) => node.metadata?.name)
      .filter((name): name is string => name !== undefined),
  }
}

async function rename(page: Page, from: string, to: string): Promise<void> {
  await layerRow(page, from).click()
  await page.keyboard.press("F2")

  const field = page.getByRole("textbox", { name: `Rename ${from}` })

  await expect(field).toBeFocused()
  await field.fill(to)
  await field.press("Enter")
}

/*
 * `exact` on every one of these, and deliberately.
 *
 * Playwright matches a plain string as a case-insensitive substring, so
 * `getByText("Saved")` also matches "Unsaved changes" — which made the first
 * version of these tests pass the instant the page loaded, before anything had
 * been written at all.
 */
function saved(page: Page) {
  return page.getByText("Saved", { exact: true })
}

function unsaved(page: Page) {
  return page.getByText("Unsaved changes", { exact: true })
}

test("an edit reaches the database", async ({ context, page }) => {
  const pageId = await openPage(context, page)
  const before = await stored(pageId)

  expect(before.names).toContain("Body")

  await rename(page, "Body", "Order summary")
  await expect(saved(page)).toBeVisible({ timeout: 20_000 })

  const after = await stored(pageId)

  expect(after.names).toContain("Order summary")
  expect(after.names).not.toContain("Body")

  // A draft write creates no revision, but it does move the version — which is
  // what the next write has to be made against.
  expect(after.version).toBeGreaterThan(before.version)
})

test("the edit is still there on the next visit", async ({ context, page }) => {
  const pageId = await openPage(context, page)

  await rename(page, "Body", "Order summary")
  await expect(saved(page)).toBeVisible({ timeout: 20_000 })

  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
  await page.getByRole("tab", { name: "Layers" }).click()

  await expect(layerRow(page, "Order summary")).toBeVisible()
})

test("says it is unsaved the moment the document changes", async ({ context, page }) => {
  await openPage(context, page)

  await expect(saved(page)).toBeVisible()

  await rename(page, "Body", "Summary")

  // Honest for the five seconds before the debounce fires. Somebody who closes
  // the tab in that window is the reason this is said at all.
  await expect(unsaved(page)).toBeVisible()
  await expect(saved(page)).toBeVisible({ timeout: 20_000 })
  await expect(unsaved(page)).toBeHidden()
})

test("writes once for a burst of edits, not once per edit", async ({ context, page }) => {
  const pageId = await openPage(context, page)
  const before = await stored(pageId)

  await rename(page, "Body", "One")
  await rename(page, "One", "Two")
  await rename(page, "Two", "Three")

  await expect(saved(page)).toBeVisible({ timeout: 20_000 })

  const after = await stored(pageId)

  expect(after.names).toEqual(["Three"])

  /*
   * One version for three edits.
   *
   * The debounce is the reason a burst of edits does not become a burst of
   * requests. Three versions here would mean it is writing per keystroke.
   */
  expect(after.version).toBe(before.version + 1)
})

test("does not write when nothing about the page changed", async ({ context, page }) => {
  const pageId = await openPage(context, page)
  const before = await stored(pageId)

  // Selection and panel state change the store, and are not the page.
  await layerRow(page, "Body").click()
  await page.getByRole("tab", { name: "Pages" }).click()
  await page.getByRole("tab", { name: "Layers" }).click()

  // Past both the five-second debounce and, with room to spare, any write the
  // ceiling would have forced.
  await page.waitForTimeout(9_000)

  expect((await stored(pageId)).version).toBe(before.version)
  await expect(saved(page)).toBeVisible()
})
