import { expect, test, type BrowserContext, type Cookie } from "@playwright/test"
import { prisma } from "@checkout-studio/database"
import { createDocument, serialize } from "@checkout-studio/schema"

import { createAccount, removeAccount, PASSWORD, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"

/**
 * The canvas, end to end.
 *
 * No components are registered until Phase 9, so every node renders as the
 * unsupported placeholder — which in editor-preview mode is a visible card
 * naming the missing type. That is the correct behaviour and exactly what
 * should be asserted here: the canvas renders a real document through the real
 * renderer, and says plainly what it cannot draw.
 *
 * What these tests are really for is the wiring: the document loaded on the
 * server, the theme resolved from its reference, the store mounted around the
 * shell, and the viewport responding to a gesture.
 */

let account: Account
let session: Cookie[]
let pageId: string

test.beforeAll(async ({ playwright, baseURL }) => {
  account = await createAccount("canvas")

  // Through the repository rather than the API service: the service's module
  // graph reaches a CommonJS patch library whose named exports Node cannot see
  // from here, and what this fixture needs is a row, not a code path.
  const row = await prisma.page.create({
    data: {
      projectId: account.projectId,
      title: "Checkout",
      slug: "checkout",
      draftSchema: {},
    },
    select: { id: true },
  })

  const blank = createDocument({
    projectId: account.projectId,
    pageId: row.id,
    themeId: "theme_default",
  })

  // A root and one child. The root is not selectable by clicking — the page
  // background clears the selection — so a page with nothing in it has nothing
  // to select.
  const document = {
    ...blank,
    nodes: {
      ...blank.nodes,
      [blank.root]: { ...blank.nodes[blank.root]!, children: ["section_e2e"] },
      section_e2e: {
        id: "section_e2e",
        type: "core.section",
        parentId: blank.root,
        children: [],
        props: {},
        styles: { desktop: { base: { minHeight: 200 } } },
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false },
      },
    },
  }

  await prisma.page.update({
    where: { id: row.id },
    data: { draftSchema: JSON.parse(serialize(document)) as object },
  })

  pageId = row.id

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

test("renders the open page through the renderer", async ({ context, page }) => {
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
