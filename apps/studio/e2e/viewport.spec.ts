import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { pressUntil, waitForHydration } from "./support/hydration"
import { modifier } from "./support/keyboard"
import { createPage } from "./support/page"

/**
 * Zoom and device switching, in a real browser.
 *
 * The state they change is tested in packages/editor and the controls in jsdom.
 * What only this can answer is whether the shortcuts survive the real keyboard
 * path — the dispatcher, the scopes, the text guard — and whether the controls
 * appear at all once a page is open.
 */

let account: Account
let session: Cookie[]

test.beforeAll(async () => {
  account = await createAccount("viewport")
  session = await signedInCookies(account)
})

test.afterAll(async () => {
  await removeAccount(account)
})

let pages = 0

async function openEditor(context: BrowserContext, page: Page): Promise<void> {
  await context.addCookies(session)

  pages += 1

  const pageId = await createPage(account.projectId, {
    title: `Viewport ${pages}`,
    slug: `viewport-${pages}`,
    nodes: [{ id: `body_v${pages}`, type: "core.section", name: "Body" }],
  })

  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
}

function zoomLabel(page: Page) {
  return page.getByRole("button", { name: /^Zoom, / })
}

/**
 * Wake the keyboard, then put the zoom back.
 *
 * The listener is attached in an effect that runs after React's hydration
 * marker, so there is a window where the page looks ready and swallows
 * keystrokes, and a global listener leaves no trace to wait on.
 *
 * `pressUntil` is the gate for that — but it polls as fast as it can, and zoom
 * is not a toggle: waiting for one exact step overshoots it and never sees the
 * value again. So the gate is "the zoom moved at all", and the reset afterwards
 * makes the presses that follow deterministic.
 */
async function wakeKeyboard(page: Page): Promise<string> {
  const mod = await modifier(page)

  await pressUntil(page, `${mod}+Equal`, page.getByRole("button", { name: /^Zoom, (?!100 )/ }))

  await page.keyboard.press(`${mod}+Digit0`)
  await expect(zoomLabel(page)).toHaveText("100%")

  return mod
}

test("the toolbar shows the device and zoom controls once a page is open", async ({
  context,
  page,
}) => {
  await openEditor(context, page)

  await expect(page.getByRole("group", { name: "Device" })).toBeVisible()
  await expect(page.getByRole("group", { name: "Zoom" })).toBeVisible()

  // Desktop to begin with, and said rather than only coloured.
  await expect(page.getByRole("button", { name: "Desktop" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(zoomLabel(page)).toHaveText("100%")
})

test("clicking a device switches it", async ({ context, page }) => {
  await openEditor(context, page)

  await page.getByRole("button", { name: "Mobile" }).click()

  await expect(page.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "Desktop" })).toHaveAttribute(
    "aria-pressed",
    "false",
  )
})

test("the zoom buttons step through the scale", async ({ context, page }) => {
  await openEditor(context, page)

  await page.getByRole("button", { name: "Zoom in" }).click()
  await expect(zoomLabel(page)).toHaveText("125%")

  await page.getByRole("button", { name: "Zoom in" }).click()
  await expect(zoomLabel(page)).toHaveText("150%")

  await page.getByRole("button", { name: "Zoom out" }).click()
  await expect(zoomLabel(page)).toHaveText("125%")

  // The percentage is the reset button.
  await zoomLabel(page).click()
  await expect(zoomLabel(page)).toHaveText("100%")
})

test("the documented zoom shortcuts work through the real keyboard", async ({ context, page }) => {
  await openEditor(context, page)

  const mod = await wakeKeyboard(page)

  // The whole keyboard path: the dispatcher, the studio scope, and three
  // bindings that deliberately shadow the browser's own page zoom.
  await page.keyboard.press(`${mod}+Equal`)
  await expect(zoomLabel(page)).toHaveText("125%")

  await page.keyboard.press(`${mod}+Equal`)
  await expect(zoomLabel(page)).toHaveText("150%")

  await page.keyboard.press(`${mod}+Minus`)
  await expect(zoomLabel(page)).toHaveText("125%")

  // And back to actual size from wherever it is.
  await page.keyboard.press(`${mod}+Digit0`)
  await expect(zoomLabel(page)).toHaveText("100%")
})

test("zooming does not make the page unsaved", async ({ context, page }) => {
  await openEditor(context, page)

  await page.getByRole("button", { name: "Zoom in" }).click()
  await page.getByRole("button", { name: "Tablet" }).click()

  // The viewport is not the page. If this were an edit, autosave would write
  // every time somebody looked closer at something.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeHidden()
})

test("the zoom shortcut does not fire while typing", async ({ context, page }) => {
  await openEditor(context, page)

  // Proven live first. A keystroke swallowed by the hydration window looks
  // exactly like one the text guard refused, and this test is about the guard.
  const mod = await wakeKeyboard(page)

  await page.getByRole("tab", { name: "Layers" }).click()

  await page.getByRole("button", { name: "Body", exact: true }).click()
  await page.keyboard.press("F2")

  const field = page.getByRole("textbox", { name: "Rename Body" })

  await expect(field).toBeFocused()

  await field.press(`${mod}+Equal`)

  // Not on the text guard's allowlist, so it belongs to the field. A zoom that
  // fired here would move the canvas while somebody was naming something.
  await expect(zoomLabel(page)).toHaveText("100%")

  await field.press("Escape")
  await expect(field).toBeHidden()

  // The same key outside the field does zoom, which is what makes the reading
  // above "the guard refused it" rather than "nothing was listening".
  await page.keyboard.press(`${mod}+Equal`)
  await expect(zoomLabel(page)).toHaveText("125%")
})

test("the controls are absent with no page open", async ({ context, page }) => {
  await context.addCookies(session)
  await page.goto(`/projects/${account.projectId}`)
  await waitForHydration(page)

  // Nothing to zoom and no breakpoint to switch. A row of controls over
  // nothing is worse than no row.
  await expect(page.getByText("No page open")).toBeVisible()
  await expect(page.getByRole("group", { name: "Device" })).toBeHidden()
  await expect(page.getByRole("group", { name: "Zoom" })).toBeHidden()
})
