import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { pressUntil, waitForHydration } from "./support/hydration"

/**
 * The editor shell, in a real browser.
 *
 * What jsdom cannot answer: whether a panel is actually the width it says it is
 * after a pointer drag, and whether the arrangement survives a page load rather
 * than a re-render.
 *
 * See docs/phases.md, Phase 4 § E2E.
 */

/*
 * Serial, and deliberately.
 *
 * They are fast, and they share a project, so ordering them costs nothing —
 * and a shared project means they must not run against each other's layout.
 */
test.describe.configure({ mode: "serial" })

let account: Account
let session: Cookie[]

/**
 * One account for the whole file.
 *
 * The session is minted rather than signed in for — see `signedInCookies`.
 * Driving the form is the auth suite's business and not the shell's.
 */
test.beforeAll(async () => {
  account = await createAccount("shell")

  // baseURL is always configured; spread rather than pass, because the option
  // is not declared as accepting undefined.
  session = await signedInCookies(account)
})

test.afterAll(async () => {
  await removeAccount(account)
})

async function signIn(context: BrowserContext): Promise<void> {
  await context.addCookies(session)
}

/**
 * The primary modifier, as this browser reports itself.
 *
 * Playwright's Chromium identifies as Windows whatever it is running on, so the
 * shell renders Ctrl labels and binds Ctrl — correctly, since that is what the
 * request said. `ControlOrMeta` would press Command on a Mac host and miss.
 * Which modifier belongs to which platform is settled in the unit tests, on both.
 */
const MOD = "Control"

/** Opens the editor and waits for it to be able to answer. */
async function openEditor(page: Page): Promise<void> {
  await page.goto(`/projects/${account.projectId}`)
  await waitForHydration(page)
}

/**
 * A panel's width, once it has finished getting there.
 *
 * Panels animate their width, so measuring immediately after a drag measures the
 * transition rather than the result. The inline style is the value the shell
 * decided on; the assertion below checks that the rendered box catches up to it.
 */
async function widthOf(page: Page, name: string): Promise<number> {
  const panel = page.getByRole("region", { name })

  await expect
    .poll(async () =>
      panel.evaluate(
        (element) =>
          Math.round(element.getBoundingClientRect().width) ===
          Number.parseInt((element as HTMLElement).style.width, 10),
      ),
    )
    .toBe(true)

  return panel.evaluate((element) => element.getBoundingClientRect().width)
}

test.describe("the editor", () => {
  test("lands on the dashboard, and opens the shell from it", async ({ page, context }) => {
    await signIn(context)
    await page.goto("/")

    // The root is a signpost: signed in goes to the dashboard.
    await page.waitForURL("**/dashboard")
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
    await expect(page.getByRole("link", { name: /Spring Sale/ })).toBeVisible()

    await page.getByRole("link", { name: /Spring Sale/ }).click()

    await expect(page.getByRole("banner", { name: "Toolbar" })).toBeVisible()
    await expect(page.getByRole("main", { name: "Canvas" })).toBeVisible()
    await expect(page.getByRole("contentinfo", { name: "Status bar" })).toBeVisible()
  })

  test("resizes a panel by dragging, and keeps it across a reload", async ({ page, context }) => {
    await signIn(context)
    await openEditor(page)

    const before = await widthOf(page, "Components")
    const divider = page.getByRole("separator", { name: "Resize sidebar" })
    const box = await divider.boundingBox()

    expect(box).not.toBeNull()

    // A real drag, which is the thing jsdom cannot do: pointer events, a moving
    // pointer, and the layout responding to each frame.
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + 60, box!.y + box!.height / 2, { steps: 10 })

    /*
     * The write is debounced past the end of the drag, so the reload has to
     * come after it lands.
     *
     * Waited for rather than slept through. A fixed delay was long enough until
     * the suite grew a test that opens two browsers, and then it was not: a
     * reload that overtakes the write reads the old width back and the test
     * fails for a reason that has nothing to do with dragging.
     */
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/api/preferences/shell.layout") &&
        response.request().method() === "PUT",
    )

    await page.mouse.up()

    const after = await widthOf(page, "Components")
    expect(after).toBeGreaterThan(before)

    await saved
    await page.reload()

    expect(await widthOf(page, "Components")).toBe(after)
  })

  test("keeps a collapsed panel collapsed across a reload", async ({ page, context }) => {
    await signIn(context)
    await openEditor(page)

    await page.getByRole("button", { name: "Toggle inspector" }).click()
    await expect(page.getByRole("region", { name: "Inspector" })).toBeHidden()

    await page.waitForTimeout(1_200)
    await page.reload()

    await expect(page.getByRole("region", { name: "Inspector" })).toBeHidden()
    await expect(page.getByRole("main", { name: "Canvas" })).toBeVisible()
  })

  test("opens the palette, runs a command, and the panel closes", async ({ page, context }) => {
    await signIn(context)
    await openEditor(page)

    await expect(page.getByRole("region", { name: "Components" })).toBeVisible()

    const search = page.getByRole("combobox")
    await pressUntil(page, `${MOD}+k`, search)
    await expect(search).toBeFocused()

    await search.fill("left sidebar")
    await page.keyboard.press("Enter")

    await expect(page.getByRole("region", { name: "Components" })).toBeHidden()
    await expect(page.getByRole("combobox")).toBeHidden()
  })

  test("closes the palette on Escape and gives focus back", async ({ page, context }) => {
    await signIn(context)
    await openEditor(page)

    const toggle = page.getByRole("button", { name: "Toggle inspector" })
    await toggle.focus()

    await pressUntil(page, `${MOD}+k`, page.getByRole("combobox"))
    await expect(page.getByRole("combobox")).toBeFocused()

    await page.keyboard.press("Escape")

    await expect(page.getByRole("combobox")).toBeHidden()
    await expect(toggle).toBeFocused()
  })

  test("shows the shortcut reference on the key it advertises", async ({ page, context }) => {
    await signIn(context)
    await openEditor(page)

    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" })
    await pressUntil(page, `${MOD}+Slash`, sheet)
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText("Toggle left sidebar")).toBeVisible()
  })

  // No mouse, from the address bar to a panel and back.
  test("can be operated entirely from the keyboard", async ({ page, context }) => {
    await signIn(context)
    await openEditor(page)

    await page.getByRole("banner", { name: "Toolbar" }).focus()

    // The first press also waits out the gap between hydration and the shell's
    // listener; after that the keyboard is live.
    await expect
      .poll(async () => {
        await page.keyboard.press("F6")

        return page
          .getByRole("region", { name: "Components" })
          .evaluate((element) => element === document.activeElement)
      })
      .toBe(true)

    await page.keyboard.press("F6")
    await expect(page.getByRole("main", { name: "Canvas" })).toBeFocused()
  })
})

test("gets back to the projects list from the canvas", async ({ page, context }) => {
  await context.addCookies(session)
  await page.goto(`/projects/${account.projectId}`)
  await waitForHydration(page)

  // There was no way out: the canvas was reachable from the dashboard and the
  // dashboard from nowhere.
  await page.getByRole("link", { name: "All projects" }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
})

test("offers a way to change a shortcut from the reference that lists it", async ({
  page,
  context,
}) => {
  await context.addCookies(session)
  await page.goto(`/projects/${account.projectId}`)
  await waitForHydration(page)

  const reference = page.getByRole("dialog", { name: "Keyboard shortcuts" })

  // Retried, like every other shortcut in this file: the binding is live once
  // the shell has registered it, and the keystroke can arrive first.
  await pressUntil(page, `${MOD}+Slash`, reference)

  await expect(reference).toBeVisible()

  /*
   * Every key on that list is remappable and the screen that does it was
   * reachable only by typing its URL. A reference that lists keys is the one
   * place a person is thinking about them.
   */
  await expect(reference.getByRole("link", { name: "keyboard settings" })).toHaveAttribute(
    "href",
    "/settings/keyboard",
  )
})

test("scrolls a dialog taller than the window", async ({ page, context }) => {
  await context.addCookies(session)
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto(`/projects/${account.projectId}`)
  await waitForHydration(page)

  const reference = page.getByRole("dialog", { name: "Keyboard shortcuts" })

  // Retried, like every other shortcut in this file: the binding is live once
  // the shell has registered it, and the keystroke can arrive first.
  await pressUntil(page, `${MOD}+Slash`, reference)

  await expect(reference).toBeVisible()

  /*
   * A `fixed` dialog with no height overflows both ends of the window and
   * neither can be reached — the top is clipped off screen and the bottom is
   * below the fold, with nothing to scroll. Forty shortcuts, of which about
   * twenty-five were readable and the rest never.
   */
  const body = reference.locator("div.overflow-y-auto").first()

  await expect(body).toBeVisible()

  const scrollable = await body.evaluate((node) => node.scrollHeight > node.clientHeight + 1)

  expect(scrollable).toBe(true)

  // And the way out stays on screen while it scrolls.
  await body.evaluate((node) => node.scrollTo(0, node.scrollHeight))

  await expect(reference.getByRole("button", { name: "Close" })).toBeInViewport()
})
