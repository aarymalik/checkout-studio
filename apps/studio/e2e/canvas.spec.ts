import { expect, test, type BrowserContext, type Cookie } from "@playwright/test"
import { prisma } from "@checkout-studio/database"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * The canvas, end to end.
 *
 * Nothing is registered until Phase 9, so the editor shows its "no components"
 * state and the canvas itself is not mounted. The tests that drive the canvas
 * are skipped rather than deleted: they are correct, they passed while the
 * canvas was being built, and they are what Phase 9 turns back on with one
 * line when the first real component exists.
 *
 * What still runs is everything the empty state can prove: the page loads, the
 * document is resolved on the server, and the editor says once what it cannot
 * do rather than once per node.
 */

let account: Account
let session: Cookie[]
let pageId: string

test.beforeAll(async () => {
  account = await createAccount("canvas")

  // A root and one child. The root is not selectable by clicking — the page
  // background clears the selection — so a page with nothing in it has nothing
  // to select.
  pageId = await createPage(account.projectId, {
    title: "Checkout",
    slug: "checkout",
    nodes: [
      {
        id: "section_e2e",
        type: "core.section",
        styles: { desktop: { base: { minHeight: 200 } } },
      },
    ],
  })

  session = await signedInCookies(account)
})

test.afterAll(async () => {
  await removeAccount(account)
})

async function signIn(context: BrowserContext): Promise<void> {
  await context.addCookies(session)
}

test("says once that no components are registered", async ({ context, page }) => {
  await signIn(context)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  // Until Phase 9 the registry is empty, and the editor says so once rather
  // than letting the renderer repeat a per-node plugin error for every node.
  await expect(page.getByText("No components yet")).toBeVisible()
  await expect(page.locator("[data-ck-unsupported]")).toHaveCount(0)
})

test.skip("renders the open page through the renderer", async ({ context, page }) => {
  await signIn(context)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  await expect(page.getByRole("main", { name: "Canvas" })).toBeVisible()

  // The renderer's own root, inside the device frame: the canvas and the
  // published page share one rendering path.
  await expect(page.locator("[data-canvas-frame] .checkout-root")).toBeAttached()

  // The page's one node has no component registered, and the editor says so
  // rather than showing an empty frame.
  await expect(page.locator("[data-ck-unsupported]").first()).toBeVisible()
  await expect(page.getByText("core.section")).toBeVisible()
})

test.skip("shows the device frame it is editing", async ({ context, page }) => {
  await signIn(context)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  await expect(page.getByText("Desktop · 1440")).toBeVisible()
})

test.skip("zooms towards the pointer", async ({ context, page }) => {
  await signIn(context)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  const frame = page.locator("[data-canvas-frame]")

  // Visible before measured. `boundingBox` is a single read with no retry, so
  // measuring without waiting reports whatever was there at that instant.
  await expect(frame).toBeVisible()

  const before = await frame.boundingBox()

  await page.getByRole("main", { name: "Canvas" }).hover()
  await page.keyboard.down("Meta")
  await page.mouse.wheel(0, -240)
  await page.keyboard.up("Meta")

  const after = await frame.boundingBox()

  expect(before).not.toBeNull()
  expect(after).not.toBeNull()
  // Wider on screen, because the zoom went up.
  expect(after?.width ?? 0).toBeGreaterThan(before?.width ?? 0)
})

test.skip("selects a node by clicking it, and clears on the background", async ({
  context,
  page,
}) => {
  await signIn(context)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  await page.locator('[data-ck-unsupported="core.section"]').click()

  // The breadcrumb only exists once something is selected, so its presence is
  // the selection.
  await expect(page.getByRole("navigation", { name: "Selected element path" })).toBeVisible()

  // Far from the frame, which is centred: empty canvas clears the selection.
  await page.getByRole("main", { name: "Canvas" }).click({ position: { x: 8, y: 8 } })

  await expect(page.getByRole("navigation", { name: "Selected element path" })).toBeHidden()
})

test("has a page to open only while one exists", async ({ context, page }) => {
  await signIn(context)

  // A project whose pages have gone shows the empty state rather than a frame
  // suggesting the page exists and is blank.
  await prisma.page.update({ where: { id: pageId }, data: { deletedAt: new Date() } })

  try {
    await page.goto(`/projects/${account.projectId}`)
    await waitForHydration(page)

    await expect(page.getByText("No page open")).toBeVisible()
  } finally {
    await prisma.page.update({ where: { id: pageId }, data: { deletedAt: null } })
  }
})
