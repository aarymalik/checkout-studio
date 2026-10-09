import { randomUUID } from "node:crypto"

import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * The inline selection toolbar, in the product.
 *
 * It had unit tests from Phase 7 and no end-to-end test at all, which is how a
 * row of buttons that does nothing reaches somebody using the application:
 * every piece works in isolation and the assembly is what is broken.
 */

let account: Account
let session: Cookie[]
let pageId: string

test.beforeAll(async () => {
  account = await createAccount("toolbar")
  session = await signedInCookies(account)
})

// A page per test: opening one takes the edit lock, and a second session on the
// same page gets the takeover prompt. canvas.spec.ts pays for this lesson.
test.beforeEach(async () => {
  pageId = await createPage(account.projectId, {
    title: "Checkout",
    slug: `toolbar-${randomUUID().slice(0, 8)}`,
    nodes: [
      {
        id: "section_e2e",
        type: "core.section",
        name: "Hero",
        styles: { desktop: { base: { minHeight: 200 } } },
      },
      /*
       * A sibling, so Move up and Move down have somewhere to go. With one
       * child they are correctly disabled, and a test of them would be a test
       * of nothing — which is what the first diagnostic run of this file
       * showed: `[["Move up","true"],["Move down","true"], …]`.
       */
      {
        id: "second_e2e",
        type: "core.section",
        name: "Footer",
        styles: { desktop: { base: { minHeight: 80 } } },
      },
    ],
  })
})

test.afterAll(async () => {
  await removeAccount(account)
})

async function select(context: BrowserContext, page: Page) {
  await context.addCookies(session)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  // Near its own top-left: the frame is wider than the canvas region, so the
  // centre of a desktop section is off the side of it.
  await page.locator(".ck-section_e2e").click({ position: { x: 24, y: 24 } })

  await expect(page.getByRole("toolbar", { name: "Selection" })).toBeVisible()
}

function layerRow(page: Page, name: string) {
  return page.getByRole("tree", { name: "Layers" }).getByRole("button", { name, exact: true })
}

test("deletes the selection", async ({ context, page }) => {
  await select(context, page)

  await page
    .getByRole("toolbar", { name: "Selection" })
    .getByRole("button", { name: "Delete" })
    .click()

  await page.getByRole("tab", { name: "Layers" }).click()

  await expect(layerRow(page, "Hero")).toBeHidden()
  await expect(layerRow(page, "Footer")).toBeVisible()
})

test("duplicates the selection", async ({ context, page }) => {
  await select(context, page)

  await page
    .getByRole("toolbar", { name: "Selection" })
    .getByRole("button", { name: "Duplicate" })
    .click()

  await page.getByRole("tab", { name: "Layers" }).click()

  // Named so the copy is tellable from the original: the layers panel gives a
  // duplicate the same name, and two rows called "Hero" is the assertion.
  await expect(layerRow(page, "Hero")).toHaveCount(2)
})

test("hides the selection, and the node stops being rendered", async ({ context, page }) => {
  await select(context, page)

  await page
    .getByRole("toolbar", { name: "Selection" })
    .getByRole("button", { name: "Hide" })
    .click()

  /*
   * docs/editor-behavior.md § Hide: remains in Layers, not rendered, can be
   * restored. So the node leaves the canvas — and the toolbar leaves with it,
   * because the toolbar is positioned from the node's box. That is why Hide is
   * not a toggle here; restoring is the layers panel's.
   */
  await expect(page.locator(".ck-section_e2e")).toHaveCount(0)
  await expect(page.getByRole("toolbar", { name: "Selection" })).toBeHidden()

  // Still selected, and still there: the live region is what says so, because
  // there is nothing left on the canvas to look at.
  // The canvas's own live region. There are three on the page — this one, the
  // save status and the shell's layout announcement.
  await expect(page.getByRole("main", { name: "Canvas" }).getByRole("status")).toHaveText(/hidden/)

  await page.getByRole("tab", { name: "Layers" }).click()

  await expect(layerRow(page, "Hero")).toBeVisible()
})

test("locks the selection, and says so, because a locked node still renders", async ({
  context,
  page,
}) => {
  await select(context, page)

  const toolbar = page.getByRole("toolbar", { name: "Selection" })

  await toolbar.getByRole("button", { name: "Lock" }).click()

  /*
   * Lock is a toggle and Hide is not, and the difference is whether the node
   * survives on the canvas. A locked node renders, so the toolbar keeps the box
   * it is positioned from and the way back is right there.
   */
  await expect(toolbar.getByRole("button", { name: "Unlock" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  // What the lock forbids is refused rather than hidden, so the row does not
  // rearrange itself under the pointer.
  await expect(toolbar.getByRole("button", { name: "Delete" })).toHaveAttribute(
    "aria-disabled",
    "true",
  )

  await toolbar.getByRole("button", { name: "Unlock" }).click()

  await expect(toolbar.getByRole("button", { name: "Lock" })).toBeVisible()
})

test("moves the selection among its siblings", async ({ context, page }) => {
  await select(context, page)

  // The first of two, so down is the direction with somewhere to go.
  await page
    .getByRole("toolbar", { name: "Selection" })
    .getByRole("button", { name: "Move down" })
    .click()

  // Undo becomes available, which is the store having been written to. The two
  // sections are both named "Section", so the order is what changed rather
  // than the contents.
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled()
})
