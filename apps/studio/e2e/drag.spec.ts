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
 * stub and no pointer has ever crossed a real canvas. The one real drag
 * anywhere in this suite was the panel-resize divider.
 *
 * That is the same gap the selection toolbar's buttons fell through, at a much
 * larger size — every piece tested, the assembly never run. These are the
 * tests for the assembly.
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

/** The point to aim at inside a node: near its own top-left, not its centre. */
async function grip(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox()

  if (box === null) throw new Error(`${selector} has no box.`)

  /*
   * The frame is 1440px wide and the canvas region is narrower, so the centre
   * of a desktop section is off the side of the canvas and over the inspector.
   * canvas.spec.ts paid for this lesson.
   */
  return { x: box.x + 24, y: box.y + 24 }
}

test("shows the preview while a node is in the hand, and not after", async ({ context, page }) => {
  await open(context, page)

  const from = await grip(page, ".ck-hero_e2e")
  const preview = page.locator("[data-drag-preview]")

  await expect(preview).toHaveCount(0)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Past the 4px threshold, which is what separates a drag from a click that
  // wobbled.
  await page.mouse.move(from.x + 40, from.y + 120, { steps: 10 })

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
  const from = await grip(page, ".ck-hero_e2e")

  await expect(surface).toHaveCSS("cursor", "default")

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y + 120, { steps: 10 })

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

/*
 * Known broken. See the note on the test below it.
 *
 * `test.fail` rather than a skip or a comment: it runs, and it turns into a
 * failure the day somebody fixes the canvas's coordinate mapping. A skipped
 * test rots quietly and a TODO is not executable.
 */
test.fail("shows where it would land before the pointer is released", async ({ context, page }) => {
  await open(context, page)

  const from = await grip(page, ".ck-hero_e2e")
  const onto = await grip(page, ".ck-footer_e2e")

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(onto.x, onto.y + 8, { steps: 12 })

  /*
   * Phase 8's first exit criterion: the drop position is always shown before
   * release. In a browser it is not shown at all — the only thing in the
   * overlay layer during a drag is the selection outline.
   *
   * The first version of this test asserted
   * `div.bg-primary, div.border-primary` and passed, because the selection
   * outline is `border-primary`. It was green against a feature that does
   * not work.
   */
  const indicator = page.locator("[data-canvas-overlays] div.bg-primary")

  await expect(indicator.first()).toBeVisible()

  await page.mouse.up()
})

/**
 * Known broken, and the reason the test above is too.
 *
 * A canvas drag resolves no drop in a browser, so the release writes nothing:
 * undo stays disabled and the tree is unchanged. Reproduced here; the cause is
 * in the canvas's pointer-to-canvas mapping.
 *
 * `localPoint` measures from the gesture surface's **border box**, while the
 * transformed frame inside it is `absolute left-0 top-0` — which positions
 * against the surface's **padding box**. The surface carries
 * `paddingTop`/`paddingLeft` of `RULER_SIZE` whenever the rulers are shown, so
 * every pointer position is 20px out from where the frame actually is, in both
 * axes. The overlay layer is `absolute inset-0` in the same surface, so what it
 * draws is offset by the same amount — which is why the selection outline does
 * not sit on the selection either.
 *
 * Nothing in jsdom could have caught it: there is no layout there, so every
 * rect in the integration tests is a stub and the padding does not exist.
 *
 * Not fixed here. The fix is to stop putting padding on the gesture surface and
 * give the rulers a layer of their own, which touches selection, resize, drop
 * resolution and the alignment guides at once — and it deserves measuring
 * rather than a 20px correction added in four places.
 */
test.fail("moves a node into another container, as one undo step", async ({ context, page }) => {
  await open(context, page)

  const from = await grip(page, ".ck-hero_e2e")
  const footer = await page.locator(".ck-footer_e2e").boundingBox()

  if (footer === null) throw new Error("Footer has no box.")

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()

  /*
   * The middle of Footer, which means "inside it".
   *
   * A node has three regions: the top and bottom quarters of its height —
   * capped at 12px, so a tall section does not get a 200px edge — mean before
   * and after, and the middle means inside. See `edgeBand` in
   * packages/editor/src/dnd/resolve.ts. Aiming at the middle is aiming at the
   * one region whose meaning does not depend on arithmetic this test would
   * otherwise be duplicating.
   */
  await page.mouse.move(footer.x + 24, footer.y + footer.height / 2, { steps: 12 })

  await page.mouse.up()

  await page.getByRole("tab", { name: "Layers" }).click()

  const tree = page.getByRole("tree", { name: "Layers" })

  // Hero is inside Footer now, so the tree shows it one level deeper.
  // The page root is not a row, so a child of it is level 1 and a grandchild
  // is level 2.
  await expect(tree.getByRole("treeitem", { name: /Hero/ })).toHaveAttribute("aria-level", "2")

  /*
   * One drag is one undo. Phase 8's last exit criterion, and the thing a
   * per-pointer-move write would break without anything looking wrong until
   * somebody pressed undo forty times.
   */
  await page.getByRole("button", { name: "Undo", exact: true }).click()

  await expect(tree.getByRole("treeitem", { name: /Hero/ })).toHaveAttribute("aria-level", "1")
})
