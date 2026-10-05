import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * The Layers panel, in a real browser.
 *
 * What jsdom cannot answer: whether the panel survives server rendering and
 * hydration, whether a virtualized list inside the panel's scroll area is
 * actually scrollable, and whether a rename reaches the database.
 *
 * The canvas is not mounted until Phase 9 registers a component, so this is the
 * one panel that shows a real document today — and the only surface that
 * reflects the selection, since the breadcrumb lives inside the canvas and the
 * inspector waits for its own phase.
 *
 * Edits here are expected to survive a reload. Autosave is what makes that
 * true, and it is tested on its own in autosave.spec.ts; these two assert it
 * through the panel, because a panel that mutates the document and a document
 * that persists are only useful together.
 */

test.describe.configure({ mode: "serial" })

let account: Account
let session: Cookie[]

test.beforeAll(async () => {
  account = await createAccount("layers")

  session = await signedInCookies(account)
})

test.afterAll(async () => {
  await removeAccount(account)
})

async function signIn(context: BrowserContext): Promise<void> {
  await context.addCookies(session)
}

let pages = 0

/**
 * A page of this test's own, opened on the Layers panel.
 *
 * Every test, not only the ones that write. The editor takes an edit lock when
 * it opens and gives it back on the way out, and that release is best-effort —
 * so two tests sharing a page can find the previous one still holding it and be
 * offered a takeover prompt instead of a panel.
 *
 * ```
 * page
 * ├── Header
 * │   └── Title
 * └── Body
 * ```
 */
async function openOwnLayers(page: Page): Promise<string> {
  pages += 1

  const id = await createPage(account.projectId, {
    title: `Layers ${pages}`,
    slug: `layers-${pages}`,
    nodes: [
      {
        id: `header_${pages}`,
        type: "core.section",
        name: "Header",
        children: [`title_${pages}`],
      },
      { id: `title_${pages}`, type: "core.heading", name: "Title" },
      { id: `body_${pages}`, type: "core.section", name: "Body" },
    ],
  })

  await openLayers(page, id)

  return id
}

async function openLayers(page: Page, id: string): Promise<void> {
  await page.goto(`/projects/${account.projectId}?page=${id}`)
  await waitForHydration(page)
  await page.getByRole("tab", { name: "Layers" }).click()
}

/*
 * `exact` matters here. Playwright matches a plain string as a case-insensitive
 * substring, so `getByText("Saved")` also matches "Unsaved changes".
 */
function settled(page: Page) {
  return page.getByText("Saved", { exact: true })
}

test("lists the page's elements as a tree", async ({ context, page }) => {
  await signIn(context)
  await openOwnLayers(page)

  const tree = page.getByRole("tree", { name: "Layers" })

  await expect(tree).toBeVisible()

  // The names from the document, at the depths the document gives them.
  await expect(tree.getByRole("treeitem").filter({ hasText: "Header" })).toHaveAttribute(
    "aria-level",
    "1",
  )
  await expect(tree.getByRole("treeitem").filter({ hasText: "Title" })).toHaveAttribute(
    "aria-level",
    "2",
  )

  // The page root is not listed: it cannot be selected on the canvas, and a row
  // that cannot be chosen teaches people to stop trying.
  await expect(tree.getByRole("treeitem")).toHaveCount(3)
})

test("selects a node, and the store is what says so", async ({ context, page }) => {
  await signIn(context)
  await openOwnLayers(page)

  await page.getByRole("button", { name: "Title", exact: true }).click()

  const rows = page.locator('[role="tree"][aria-label="Layers"] [role="treeitem"]')

  // aria-selected is read from the store rather than from local state, so this
  // is the round trip: the click reached the store and the panel re-rendered
  // from it. The breadcrumb and the inspector would be the stronger check, and
  // neither is mounted until Phase 9 registers a component.
  await expect(rows.filter({ hasText: "Title" })).toHaveAttribute("aria-selected", "true")
  await expect(rows.filter({ hasText: "Header" })).toHaveAttribute("aria-selected", "false")

  // One tab stop for the tree, with the current row named rather than focused.
  await expect(page.getByRole("tree", { name: "Layers" })).toHaveAttribute(
    "aria-activedescendant",
    /.+/,
  )
})

test("renames a node, and the name survives a reload", async ({ context, page }) => {
  await signIn(context)

  const id = await openOwnLayers(page)

  await page.getByRole("button", { name: "Body", exact: true }).click()
  await page.keyboard.press("F2")

  const field = page.getByRole("textbox", { name: "Rename Body" })

  // Focused, and the text selected: a rename almost always replaces the name.
  // select() alone does not move focus, so this is the assertion that keeps the
  // typing out of the tree.
  await expect(field).toBeFocused()

  await field.fill("Order summary")
  await field.press("Enter")

  await expect(page.getByRole("button", { name: "Order summary", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Body", exact: true })).toBeHidden()

  // Focus goes back to the tree, or the next keystroke goes nowhere.
  await expect(page.getByRole("tree", { name: "Layers" })).toBeFocused()

  // And it is on the server. A rename that only lives in the store is a rename
  // the user loses.
  await expect(settled(page)).toBeVisible({ timeout: 20_000 })

  await openLayers(page, id)

  await expect(page.getByRole("button", { name: "Order summary", exact: true })).toBeVisible()
})

test("reorders with the keyboard, and the order survives a reload", async ({ context, page }) => {
  await signIn(context)

  const id = await openOwnLayers(page)

  // The top-level rows, in the order the panel shows them. The list is flat in
  // the DOM, so a row's text is its own label and not its subtree's.
  const order = () =>
    page
      .locator('[role="tree"][aria-label="Layers"] [role="treeitem"][aria-level="1"]')
      .evaluateAll((rows) => rows.map((row) => row.textContent?.trim() ?? ""))

  expect(await order()).toEqual(["Header", "Body"])

  await page.getByRole("button", { name: "Header", exact: true }).click()
  await page.keyboard.press("Alt+ArrowDown")

  // Past Body, which is the only way to reorder without a pointer until drag
  // arrives in Phase 8.
  await expect.poll(order).toEqual(["Body", "Header"])

  await expect(settled(page)).toBeVisible({ timeout: 20_000 })

  await openLayers(page, id)

  expect(await order()).toEqual(["Body", "Header"])
})

test("searches, keeping the ancestors of a match", async ({ context, page }) => {
  await signIn(context)
  await openOwnLayers(page)

  await page.getByRole("searchbox", { name: "Search layers" }).fill("title")

  await expect(page.getByRole("button", { name: "Title", exact: true })).toBeVisible()
  // Without the chain above it, a result is a row with no context.
  await expect(page.getByRole("button", { name: "Header", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Body", exact: true })).toBeHidden()
})
