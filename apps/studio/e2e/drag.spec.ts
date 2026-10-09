import { randomUUID } from "node:crypto"

import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * Dragging, in a browser.
 *
 * The whole of Phase 8 shipped with integration tests in packages/editor and
 * nothing end to end: jsdom has no layout, so every rect in those tests is a
 * stub and no pointer had ever crossed a real canvas. The one real drag
 * anywhere in this suite was the panel-resize divider.
 *
 * ## Where to aim, and why it matters
 *
 * The frame is 1440px wide and the canvas region is narrower, so two things
 * are true at once: the centre of a desktop section is off the side of the
 * canvas, and a point near the canvas's own edge is inside the auto-scroll
 * band.
 *
 * The first version of these tests aimed 24px inside a node's left edge, which
 * is both. Auto-scroll began panning the canvas out from under the pointer —
 * `pan.x` drifted to 78 while the pointer sat still — so the projected point
 * left the frame and no drop resolved. I read that as the product being
 * broken, published it as a root cause, and it was the test.
 *
 * So: aim at the canvas region's horizontal centre, and use a node's own box
 * only for the vertical.
 */

let account: Account
let session: Cookie[]
let pageId: string

test.beforeAll(async () => {
  account = await createAccount("drag")
  session = await signedInCookies(account)
})

// A page per test: opening one takes the edit lock, and a second session on the
// same page gets the takeover prompt, which puts `aria-hidden` on the canvas.
test.beforeEach(async () => {
  pageId = await createPage(account.projectId, {
    title: "Checkout",
    slug: `drag-${randomUUID().slice(0, 8)}`,
    nodes: [
      {
        id: "hero_e2e",
        type: "core.section",
        name: "Hero",
        styles: { desktop: { base: { minHeight: 160 } } },
      },
      {
        id: "footer_e2e",
        type: "core.section",
        name: "Footer",
        styles: { desktop: { base: { minHeight: 160 } } },
      },
    ],
  })
})

test.afterAll(async () => {
  await removeAccount(account)
})

async function open(context: BrowserContext, page: Page): Promise<void> {
  await context.addCookies(session)
  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
  await expect(page.locator(".ck-hero_e2e")).toBeVisible()
}

/** Somewhere safe to put the pointer: central across, and on this node down. */
async function aim(page: Page, selector: string, offsetY = 0): Promise<{ x: number; y: number }> {
  const node = await page.locator(selector).boundingBox()
  const canvas = await page.getByRole("main", { name: "Canvas" }).boundingBox()

  if (node === null || canvas === null) throw new Error(`${selector} has no box.`)

  return { x: canvas.x + canvas.width / 2, y: node.y + offsetY }
}

test("shows the preview while a node is in the hand, and not after", async ({ context, page }) => {
  await open(context, page)

  const from = await aim(page, ".ck-hero_e2e", 24)
  const preview = page.locator("[data-drag-preview]")

  await expect(preview).toHaveCount(0)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Past the 4px threshold, which is what separates a drag from a click that
  // wobbled.
  await page.mouse.move(from.x, from.y + 120, { steps: 10 })

  /*
   * docs/editor-behavior.md § Drag Preview: 80% opacity, a shadow, and 1.02
   * scale. The thing in the user's hand.
   */
  await expect(preview).toBeVisible()
  await expect(preview).toHaveCSS("opacity", "0.8")

  await page.mouse.up()

  await expect(preview).toHaveCount(0)
})

test("changes the cursor while something is being carried", async ({ context, page }) => {
  await open(context, page)

  const surface = page.locator("main#shell-canvas > div").first()
  const from = await aim(page, ".ck-hero_e2e", 24)

  await expect(surface).toHaveCSS("cursor", "default")

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y + 120, { steps: 10 })

  /*
   * docs/ui-guidelines.md § Dragging: "cursor changes appropriately". It did
   * not — the canvas kept the default arrow for the whole gesture, so the only
   * sign a drag was happening was the preview. Reported by somebody using the
   * application as the drag having no icon.
   */
  await expect(surface).toHaveCSS("cursor", "grabbing")

  await page.mouse.up()

  await expect(surface).toHaveCSS("cursor", "default")
})

test("shows where it would land before the pointer is released", async ({ context, page }) => {
  await open(context, page)

  const from = await aim(page, ".ck-hero_e2e", 24)
  // Six pixels inside Footer's top edge: the band that means "before it".
  const onto = await aim(page, ".ck-footer_e2e", 6)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(onto.x, onto.y, { steps: 12 })

  /*
   * Phase 8's first exit criterion: the drop position is always shown before
   * release.
   *
   * `bg-primary` is the insertion line and nothing else. The first version of
   * this matched `div.bg-primary, div.border-primary` — and the selection
   * outline is `border-primary`, so it was green without ever seeing an
   * indicator.
   */
  await expect(page.locator("[data-canvas-overlays] div.bg-primary").first()).toBeVisible()

  await page.mouse.up()
})

test("moves a node into another container, as one undo step", async ({ context, page }) => {
  await open(context, page)

  const from = await aim(page, ".ck-hero_e2e", 24)
  const footer = await page.locator(".ck-footer_e2e").boundingBox()

  if (footer === null) throw new Error("Footer has no box.")

  const onto = await aim(page, ".ck-footer_e2e", footer.height / 2)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()

  /*
   * The middle of Footer, which means "inside it".
   *
   * A node has three regions: the top and bottom quarters of its height —
   * capped at 12px, so a tall section does not get a 200px edge — mean before
   * and after, and the middle means inside. See `edgeBand` in
   * packages/editor/src/dnd/resolve.ts.
   */
  await page.mouse.move(onto.x, onto.y, { steps: 12 })
  await page.mouse.up()

  await page.getByRole("tab", { name: "Layers" }).click()

  const tree = page.getByRole("tree", { name: "Layers" })

  // The page root is not a row, so a child of it is level 1 and Hero inside
  // Footer is level 2.
  await expect(tree.getByRole("treeitem", { name: /Hero/ })).toHaveAttribute("aria-level", "2")

  /*
   * One drag is one undo. Phase 8's last exit criterion, and the thing a
   * per-pointer-move write would break without anything looking wrong until
   * somebody pressed undo forty times.
   */
  await page.getByRole("button", { name: "Undo", exact: true }).click()

  await expect(tree.getByRole("treeitem", { name: /Hero/ })).toHaveAttribute("aria-level", "1")
})

test("picks a node up with the keyboard and announces where it would land", async ({
  context,
  page,
}) => {
  await open(context, page)

  const from = await aim(page, ".ck-hero_e2e", 24)

  await page.mouse.click(from.x, from.y)

  const announcer = page.getByRole("main", { name: "Canvas" }).getByRole("status")

  await expect(announcer).toHaveText(/Hero/)

  /*
   * `M` picks up, per docs/keyboard-shortcuts.md § Keyboard drag and drop.
   * An unmodified character key, which WCAG 2.1.4 allows only when a shortcut
   * is active on focus — so it is bound in the canvas scope and listed among
   * the enumerated exemptions in reserved.ts.
   */
  await page.keyboard.press("m")

  await expect(announcer).toHaveText(/Hero, (before|after|into)/)

  await page.keyboard.press("ArrowDown")

  // Each candidate position is announced, which is what makes the mode usable
  // without sight of the canvas.
  await expect(announcer).not.toHaveText(/nowhere/)

  await page.keyboard.press("Escape")
})
