import { randomUUID } from "node:crypto"

import { expect, test, type BrowserContext, type Cookie } from "@playwright/test"
import { prisma } from "@checkout-studio/database"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * The canvas, end to end.
 *
 * These were skipped for the whole of Phases 7 and 8 — correct tests, written
 * while the canvas was built, that could not run because no component existed
 * to put on a page. `core-layout` is what turns them back on, and the first
 * thing they prove is that the plugin reaches the product rather than only the
 * test harness: the canvas mounts, the section is a real `<section>`, and
 * clicking it selects a node.
 *
 * The flows that need a second component — drag a Section, then a Heading
 * inside it — wait for `core-content`. docs/phases.md Phase 9 lists them.
 */

let account: Account
let session: Cookie[]
let pageId: string

test.beforeAll(async () => {
  account = await createAccount("canvas")
  session = await signedInCookies(account)
})

/**
 * A page per test, not a page per worker.
 *
 * Opening a page takes an edit lock, and a second session on the same page
 * gets the takeover prompt — correctly, that is what the lock is for. Shared
 * between these tests it meant the second one onwards ran behind a modal, and
 * a modal puts `aria-hidden` on the rest of the document: `getByRole` stopped
 * finding the breadcrumb while the node underneath was selected perfectly
 * well. The live region said "Section, 1 of 1" and the test said the selection
 * had not happened.
 *
 * A fresh page removes the contention rather than reacting to it. These tests
 * are about the canvas, and queuing for a lock is somebody else's subject —
 * conflict.spec.ts owns it.
 */
test.beforeEach(async () => {
  // A root and one child. The root is not selectable by clicking — the page
  // background clears the selection — so a page with nothing in it has nothing
  // to select.
  pageId = await createPage(account.projectId, {
    title: "Checkout",
    slug: `checkout-${randomUUID().slice(0, 8)}`,
    nodes: [
      {
        id: "section_e2e",
        type: "core.section",
        styles: { desktop: { base: { minHeight: 200 } } },
      },
    ],
  })
})

test.afterAll(async () => {
  await removeAccount(account)
})

async function signIn(context: BrowserContext): Promise<void> {
  await context.addCookies(session)
}

test("renders the open page through the renderer", async ({ context, page }) => {
  await signIn(context)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  await expect(page.getByRole("main", { name: "Canvas" })).toBeVisible()

  // The renderer's own root, inside the device frame: the canvas and the
  // published page share one rendering path.
  await expect(page.locator("[data-canvas-frame] .checkout-root")).toBeAttached()

  /*
   * A real section, and nothing falling back.
   *
   * `core.page` is the root of every document and `core.section` is the
   * fixture's one child, so a single unsupported placeholder anywhere here
   * would mean the plugin did not reach the product — which is the failure
   * this project has found ten times, and the one an in-harness registry
   * cannot catch.
   */
  await expect(page.locator("[data-canvas-frame] section.ck-section_e2e")).toBeVisible()
  await expect(page.locator("[data-ck-unsupported]")).toHaveCount(0)

  // A div rather than a second main landmark, because the canvas region above
  // is already one.
  await expect(page.locator("[data-canvas-frame] main")).toHaveCount(0)
})

test("shows the device frame it is editing", async ({ context, page }) => {
  await signIn(context)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  await expect(page.getByText("Desktop · 1440")).toBeVisible()
})

test("zooms towards the pointer", async ({ context, page }) => {
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

test("selects a node by clicking it, and clears on the background", async ({ context, page }) => {
  await signIn(context)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)

  const breadcrumb = page.getByRole("navigation", { name: "Selected element path" })

  /*
   * Clicked near its own top-left, not at its centre.
   *
   * The selector is the class the renderer emits for the node, which is how
   * the canvas hit tests it too — the renderer gives a node no id, on purpose.
   * The position matters more than it looks: the frame is 1440px wide and the
   * canvas region is narrower, so a desktop section is wider than the area
   * showing it. Playwright clicks an element's centre, and the centre of this
   * one is off the side of the canvas, over the inspector panel — a click that
   * lands on a different part of the application entirely.
   *
   * It passed when this file ran alone and failed in the suite, which is the
   * shape of a test that depends on the zoom it happened to get.
   */
  await page.locator(".ck-section_e2e").click({ position: { x: 24, y: 24 } })

  // The breadcrumb only exists once something is selected, so its presence is
  // the selection.
  await expect(breadcrumb).toBeVisible()

  /*
   * Empty canvas clears the selection, and where "empty" is has to be measured.
   *
   * The first version of this clicked the canvas region at (8, 8), which is
   * the rulers' corner — a click there never reaches the surface, so the
   * selection stayed and the test failed for a reason that had nothing to do
   * with selection. It had never run before: it was skipped for the whole of
   * Phases 7 and 8, because there was no component to select.
   */
  const canvas = await page.getByRole("main", { name: "Canvas" }).boundingBox()

  expect(canvas).not.toBeNull()

  // The bottom-left of the region: past the rulers, and the frame is centred.
  await page
    .getByRole("main", { name: "Canvas" })
    .click({ position: { x: 32, y: (canvas?.height ?? 0) - 32 } })

  await expect(breadcrumb).toBeHidden()
})

test("has a page to open only while one exists", async ({ context, page }) => {
  await signIn(context)

  /*
   * Every page in the project, not just this test's own.
   *
   * It used to delete one, which was the same thing while the whole file
   * shared a page. Now that each test makes its own, deleting one leaves the
   * others and the route opens the first it finds — so the test asserted an
   * empty state against a project that still had pages in it.
   */
  const pages = await prisma.page.findMany({
    where: { projectId: account.projectId, deletedAt: null },
    select: { id: true },
  })

  await prisma.page.updateMany({
    where: { id: { in: pages.map((row) => row.id) } },
    data: { deletedAt: new Date() },
  })

  try {
    await page.goto(`/projects/${account.projectId}`)
    await waitForHydration(page)

    // The empty state, rather than a frame suggesting a page exists and is
    // blank.
    await expect(page.getByText("No page open")).toBeVisible()
  } finally {
    await prisma.page.updateMany({
      where: { id: { in: pages.map((row) => row.id) } },
      data: { deletedAt: null },
    })
  }
})
