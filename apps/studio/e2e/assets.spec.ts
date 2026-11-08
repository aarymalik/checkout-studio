import { randomUUID } from "node:crypto"

import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { createAsset, PNG, type AssetFixture } from "./support/asset"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * Dragging an asset onto the canvas, in a browser.
 *
 * Phase 14 names this test. It is the one claim the unit tests cannot make:
 * jsdom has no layout, so the panel's tests can say that pressing a cell puts
 * an insertion in the store and the canvas's tests can say that a resolved
 * drop inserts a node, and neither can say that a pointer dragged across a
 * real screen turns a picture in a list into a picture on a page.
 *
 * ## No object storage
 *
 * The asset fixture writes a row whose URL is a data URI, so the library has
 * a picture in it and the canvas can draw one without a bucket, a CDN or a
 * network. What that leaves uncovered is the upload pipeline, which has its
 * own tests against a real database.
 *
 * ## Where to aim
 *
 * The same rule the node-dragging suite learned the hard way: aim at the
 * canvas region's horizontal centre and take only the vertical from the node,
 * because a point near the canvas's own edge is inside the auto-scroll band
 * and the canvas pans out from under a pointer that is sitting still.
 */

let account: Account
let session: Cookie[]
let asset: AssetFixture
let pageId: string

test.beforeAll(async () => {
  account = await createAccount("assets")
  session = await signedInCookies(account)
  asset = await createAsset(account.projectId)
})

// A page per test: opening one takes the edit lock, and a second session on
// the same page gets the takeover prompt, which puts `aria-hidden` on the
// canvas.
test.beforeEach(async () => {
  pageId = await createPage(account.projectId, {
    title: "Checkout",
    slug: `assets-${randomUUID().slice(0, 8)}`,
    nodes: [
      {
        id: "hero_assets",
        type: "core.section",
        name: "Hero",
        styles: { desktop: { base: { minHeight: 240 } } },
      },
    ],
  })
})

test.afterAll(async () => {
  await removeAccount(account)
})

async function openLibrary(context: BrowserContext, page: Page): Promise<void> {
  await context.addCookies(session)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
  await expect(page.locator(".ck-hero_assets")).toBeVisible()

  await page.getByRole("tab", { name: "Assets" }).click()
  await expect(page.getByRole("grid", { name: "Assets" })).toBeVisible()
}

/** Somewhere safe to drop: central across the canvas, and on this node down. */
async function onto(
  page: Page,
  selector: string,
  offsetY: number,
): Promise<{ x: number; y: number }> {
  const node = await page.locator(selector).boundingBox()
  const canvas = await page.getByRole("main", { name: "Canvas" }).boundingBox()

  if (node === null || canvas === null) throw new Error(`${selector} has no box.`)

  return { x: canvas.x + canvas.width / 2, y: node.y + offsetY }
}

async function dragOntoHero(page: Page): Promise<void> {
  const cell = await page.getByRole("button", { name: asset.fileName }).boundingBox()

  if (cell === null) throw new Error("The asset has no cell.")

  const target = await onto(page, ".ck-hero_assets", 80)

  await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2)
  await page.mouse.down()
  // In steps, because the canvas resolves a drop from pointer moves and a
  // single jump is one move at the destination with nothing in between.
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.mouse.up()
}

test("puts the picture on the page", async ({ context, page }) => {
  await openLibrary(context, page)
  await dragOntoHero(page)

  /*
   * The canvas draws it, which is the whole claim. The node arrived holding a
   * reference, the renderer resolved that reference to URLs, and an `<img>`
   * came out — three things that are each tested on their own and had never
   * been tested together.
   */
  const drawn = page.getByRole("main", { name: "Canvas" }).locator(`img[src="${asset.url}"]`)

  await expect(drawn).toBeVisible()
})

test("lands inside the section it was dropped on", async ({ context, page }) => {
  await openLibrary(context, page)
  await dragOntoHero(page)

  const hero = page.locator(".ck-hero_assets")

  await expect(hero.locator(`img[src="${asset.url}"]`)).toBeVisible()
})

test("leaves the page alone when it is dropped outside the canvas", async ({ context, page }) => {
  /*
   * The sidebar is not a place to put a picture. A drag that ends there
   * resolves to nothing, and nothing is what should happen — the first
   * version of the insert gesture inserted at the root whenever a drop did
   * not resolve, which put components on the page from a dragged-and-
   * abandoned gesture.
   */
  await openLibrary(context, page)

  const cell = await page.getByRole("button", { name: asset.fileName }).boundingBox()

  if (cell === null) throw new Error("The asset has no cell.")

  await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2)
  await page.mouse.down()
  await page.mouse.move(cell.x + cell.width / 2, cell.y + 40, { steps: 8 })
  await page.mouse.up()

  // Scoped to the canvas: the library's own cell draws the same picture, and
  // an unscoped locator would find that one and call it a pass.
  await expect(
    page.getByRole("main", { name: "Canvas" }).locator(`img[src="${asset.url}"]`),
  ).toHaveCount(0)
})

test("is still there after the page is reopened", async ({ context, page }) => {
  /*
   * Autosave is what makes a drop worth anything. Everything up to here is
   * true of a document that only ever existed in one tab's memory.
   */
  await openLibrary(context, page)
  await dragOntoHero(page)

  await expect(
    page.getByRole("main", { name: "Canvas" }).locator(`img[src="${asset.url}"]`),
  ).toBeVisible()

  /*
   * `exact`, because Playwright matches a plain string as a substring and
   * "Saved" is inside "Unsaved changes" — which would pass the moment the
   * page loaded. The wait is long because autosave is debounced and then has
   * a round trip to make.
   */
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.reload()
  await waitForHydration(page)

  await expect(
    page.getByRole("main", { name: "Canvas" }).locator(`img[src="${asset.url}"]`),
  ).toBeVisible()
})

test("takes an upload and shows it in the library", async ({ context, page }) => {
  /*
   * The whole pipeline, in one gesture: a file chosen in the browser, a
   * multipart request, a signature check, metadata stripped, four sizes and
   * two formats derived, bytes written to the store, a row recorded — and a
   * thumbnail that a browser actually fetches and draws.
   *
   * Phase 14 asks for this and it could not be written: the store was S3, and
   * a bucket locally means Docker. With no bucket configured the bytes go to
   * `public` and the development server serves them, which is what makes this
   * runnable here and in CI.
   */
  await openLibrary(context, page)

  await page.getByLabel(/Upload files/).setInputFiles({
    name: "uploaded.png",
    mimeType: "image/png",
    buffer: PNG,
  })

  const cell = page.getByRole("button", { name: "uploaded.png" })

  await expect(cell).toBeVisible({ timeout: 20_000 })

  /*
   * Drawn, not merely referenced. `naturalWidth` is zero for an `<img>` whose
   * source did not load, which is exactly what a URL pointing at a store
   * nobody is running looks like — and it looks like nothing else.
   */
  const drawn = await cell.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)

  expect(drawn).toBeGreaterThan(0)
})
