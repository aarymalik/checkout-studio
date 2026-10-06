import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { pressUntil, waitForHydration } from "./support/hydration"
import { modifier } from "./support/keyboard"
import { createPage } from "./support/page"

/**
 * Undo, in a real browser.
 *
 * The store has had a fifty-state history since Phase 5 and nothing could reach
 * it: there were no `edit` commands at all, so the documented ⌘Z did nothing and
 * the toolbar's undo button was hidden behind a check that was always false.
 *
 * Which made every other feature unsafe — reordering a layer, renaming a node,
 * resizing a box all landed with no way back. So this drives the keyboard and
 * the toolbar against a real edit, and checks the database rather than the
 * screen for whether the undo stuck.
 */

let account: Account
let session: Cookie[]

test.beforeAll(async () => {
  account = await createAccount("history")
  session = await signedInCookies(account)
})

test.afterAll(async () => {
  await removeAccount(account)
})

let pages = 0

async function openLayers(context: BrowserContext, page: Page): Promise<string> {
  await context.addCookies(session)

  pages += 1

  const pageId = await createPage(account.projectId, {
    title: `History ${pages}`,
    slug: `history-${pages}`,
    nodes: [{ id: `body_h${pages}`, type: "core.section", name: "Body" }],
  })

  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
  await page.getByRole("tab", { name: "Layers" }).click()

  return pageId
}

async function storedNames(pageId: string): Promise<readonly string[]> {
  const { prisma } = await import("@checkout-studio/database")
  const row = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    select: { draftSchema: true },
  })

  const schema = row.draftSchema as { nodes: Record<string, { metadata?: { name?: string } }> }

  return Object.values(schema.nodes)
    .map((node) => node.metadata?.name)
    .filter((name): name is string => name !== undefined)
}

async function rename(page: Page, from: string, to: string): Promise<void> {
  await page.getByRole("button", { name: from, exact: true }).click()
  await page.keyboard.press("F2")

  const field = page.getByRole("textbox", { name: `Rename ${from}` })

  await expect(field).toBeFocused()
  await field.fill(to)
  await field.press("Enter")
}

test("the toolbar offers undo, disabled until there is something to undo", async ({
  context,
  page,
}) => {
  await openLayers(context, page)

  const undo = page.getByRole("button", { name: "Undo", exact: true })

  // Disabled rather than absent: a control that came and went as the history
  // filled would move the buttons beside it.
  await expect(undo).toBeVisible()
  await expect(undo).toBeDisabled()

  await rename(page, "Body", "Renamed")

  await expect(undo).toBeEnabled()
})

test("undoing from the toolbar puts the name back", async ({ context, page }) => {
  const pageId = await openLayers(context, page)

  await rename(page, "Body", "Renamed")
  await expect(page.getByRole("button", { name: "Renamed", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Undo", exact: true }).click()

  await expect(page.getByRole("button", { name: "Body", exact: true })).toBeVisible()

  // And it reaches the server, or reloading brings back what was undone.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => storedNames(pageId), { timeout: 20_000 }).toContain("Body")
})

test("undo and redo work from the documented keys", async ({ context, page }) => {
  await openLayers(context, page)

  const mod = await modifier(page)

  await rename(page, "Body", "Renamed")

  // The first press is retried past the gap between hydration and the shell's
  // keyboard listener; undo is idempotent enough for that, since a second
  // press with nothing left to undo does nothing.
  await pressUntil(page, `${mod}+KeyZ`, page.getByRole("button", { name: "Body", exact: true }))

  await page.keyboard.press(`${mod}+Shift+KeyZ`)
  await expect(page.getByRole("button", { name: "Renamed", exact: true })).toBeVisible()
})

test("the undo key belongs to a text field while one has focus", async ({ context, page }) => {
  await openLayers(context, page)

  const mod = await modifier(page)

  await rename(page, "Body", "Renamed")
  await pressUntil(page, `${mod}+KeyZ`, page.getByRole("button", { name: "Body", exact: true }))

  // Back to "Body". Now open a rename field and press the same key.
  await page.getByRole("button", { name: "Body", exact: true }).click()
  await page.keyboard.press("F2")

  const field = page.getByRole("textbox", { name: "Rename Body" })

  await expect(field).toBeFocused()
  await field.fill("Typed")
  await field.press(`${mod}+KeyZ`)

  /*
   * The document must not move. The text guard lets this key through to the
   * field on purpose, so a document-level undo firing here would throw away a
   * node instead of a character.
   */
  await field.press("Escape")
  await expect(page.getByRole("button", { name: "Body", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Renamed", exact: true })).toBeHidden()
})
