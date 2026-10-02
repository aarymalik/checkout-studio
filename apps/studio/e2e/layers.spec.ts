import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, PASSWORD, type Account } from "./support/account"
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
 * Nothing here asserts that an edit survives a reload, because it does not:
 * `createAutosave` exists in packages/editor and is tested there, and no part of
 * this application calls it yet. That is Phase 5's task 13, left unfinished —
 * see docs/phases.md — and it is invisible until a panel can mutate the
 * document, which this is the first one to do.
 */

test.describe.configure({ mode: "serial" })

let account: Account
let session: Cookie[]
let pageId: string

test.beforeAll(async ({ playwright, baseURL }) => {
  account = await createAccount("layers")

  /*
   * page
   * ├── Header
   * │   └── Title
   * └── Body
   */
  pageId = await createPage(account.projectId, {
    title: "Checkout",
    slug: "checkout",
    nodes: [
      { id: "header_e2e", type: "core.section", name: "Header", children: ["title_e2e"] },
      { id: "title_e2e", type: "core.heading", name: "Title" },
      { id: "body_e2e", type: "core.section", name: "Body" },
    ],
  })

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

async function signIn(context: BrowserContext): Promise<void> {
  await context.addCookies(session)
}

async function openLayers(page: Page): Promise<void> {
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
  await page.getByRole("tab", { name: "Layers" }).click()
}

test("lists the page's elements as a tree", async ({ context, page }) => {
  await signIn(context)
  await openLayers(page)

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
  await openLayers(page)

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

test("renames a node in place", async ({ context, page }) => {
  await signIn(context)
  await openLayers(page)

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
})

test("reorders with the keyboard", async ({ context, page }) => {
  await signIn(context)
  await openLayers(page)

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
})

test("searches, keeping the ancestors of a match", async ({ context, page }) => {
  await signIn(context)
  await openLayers(page)

  await page.getByRole("searchbox", { name: "Search layers" }).fill("title")

  await expect(page.getByRole("button", { name: "Title", exact: true })).toBeVisible()
  // Without the chain above it, a result is a row with no context.
  await expect(page.getByRole("button", { name: "Header", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Body", exact: true })).toBeHidden()
})
