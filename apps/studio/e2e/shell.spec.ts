import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"

import { createAccount, removeAccount, PASSWORD, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"

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
 * Each worker signs in once in beforeAll, so running these in parallel would
 * spend the sign-in rate limit on fixtures rather than on anything being tested.
 * They are fast, and they share a project, so ordering them costs nothing.
 */
test.describe.configure({ mode: "serial" })

let account: Account
let session: Cookie[]

/**
 * One account and one sign-in for the whole file.
 *
 * Signing in per test would spend the sign-in rate limit on the fixtures rather
 * than on anything being tested — and that limit exists for a reason, so raising
 * it to suit a test suite would be the wrong end to fix.
 *
 * The session is reused as a cookie rather than by driving the form, which is
 * the auth suite's business and not the shell's.
 */
test.beforeAll(async ({ playwright, baseURL }) => {
  account = await createAccount("shell")

  // baseURL is always configured; spread rather than pass, because the option
  // is not declared as accepting undefined.
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
    await page.mouse.up()

    const after = await widthOf(page, "Components")
    expect(after).toBeGreaterThan(before)

    // The write is debounced past the end of the drag.
    await page.waitForTimeout(1_200)
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

    await page.keyboard.press(`${MOD}+k`)

    const search = page.getByRole("combobox")
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

    await page.keyboard.press(`${MOD}+k`)
    await expect(page.getByRole("combobox")).toBeFocused()

    await page.keyboard.press("Escape")

    await expect(page.getByRole("combobox")).toBeHidden()
    await expect(toggle).toBeFocused()
  })

  test("shows the shortcut reference on the key it advertises", async ({ page, context }) => {
    await signIn(context)
    await openEditor(page)

    await page.keyboard.press(`${MOD}+Slash`)

    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText("Toggle left sidebar")).toBeVisible()
  })

  // No mouse, from the address bar to a panel and back.
  test("can be operated entirely from the keyboard", async ({ page, context }) => {
    await signIn(context)
    await openEditor(page)

    await page.getByRole("banner", { name: "Toolbar" }).focus()
    await page.keyboard.press("F6")

    await expect(page.getByRole("region", { name: "Components" })).toBeFocused()

    await page.keyboard.press("F6")
    await expect(page.getByRole("main", { name: "Canvas" })).toBeFocused()
  })
})
