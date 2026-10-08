import { expect, test, type BrowserContext, type Cookie, type Page } from "@playwright/test"
import { prisma } from "@checkout-studio/database"

import { createAccount, removeAccount, signedInCookies, type Account } from "./support/account"
import { waitForHydration } from "./support/hydration"
import { createPage } from "./support/page"

/**
 * A layer row, by the name on it.
 *
 * Scoped to the tree, which it did not need to be until Phase 9. A node's name
 * now appears twice on screen — once here and once in the canvas breadcrumb,
 * which exists because the canvas mounts and something is selected — so an
 * unscoped query resolves to two elements and Playwright refuses it. The
 * duplication is correct: both are places a user reads the name.
 */
function layerRow(page: Page, name: string) {
  return page.getByRole("tree", { name: "Layers" }).getByRole("button", { name, exact: true })
}

/**
 * Choosing which document survives, end to end.
 *
 * The conflict is produced the way one actually happens: the draft moves on
 * underneath a session that is still holding the version it started from. Done
 * through the database rather than through a second browser, because the edit
 * lock means a second browser would be read-only — a real conflict needs two
 * sessions that both believe they may write, which is the window between a
 * takeover and the losing session's next heartbeat.
 *
 * What only this can show is the half that matters: that the side nobody kept
 * is in Postgres as a revision somebody can restore.
 */

let account: Account
let session: Cookie[]

test.beforeAll(async () => {
  account = await createAccount("conflict")

  session = await signedInCookies(account)
})

test.afterAll(async () => {
  await removeAccount(account)
})

let counter = 0

/** A page with two sections, so each side can change a different one. */
async function openPage(context: BrowserContext, page: Page): Promise<string> {
  await context.addCookies(session)

  counter += 1

  const pageId = await createPage(account.projectId, {
    title: `Conflict ${counter}`,
    slug: `conflict-${counter}`,
    nodes: [
      { id: `left_${counter}`, type: "core.section", name: "Left" },
      { id: `right_${counter}`, type: "core.section", name: "Right" },
    ],
  })

  await page.goto(`/projects/${account.projectId}?page=${pageId}`)
  await waitForHydration(page)
  await page.getByRole("tab", { name: "Layers" }).click()

  return pageId
}

/**
 * The other session's write.
 *
 * Straight into the row, with the version moved on — which is precisely what
 * the browser's next write will be refused for.
 */
async function theOtherSessionRenames(pageId: string, to: string): Promise<void> {
  const row = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    select: { draftSchema: true, draftVersion: true },
  })

  const schema = row.draftSchema as {
    nodes: Record<string, { metadata: Record<string, unknown> }>
  }
  const right = Object.keys(schema.nodes).find((id) => id.startsWith("right_"))

  schema.nodes[right as string]!.metadata = { locked: false, name: to }

  await prisma.page.update({
    where: { id: pageId },
    data: { draftSchema: schema as object, draftVersion: row.draftVersion + 1 },
  })
}

async function storedNames(pageId: string): Promise<readonly string[]> {
  const row = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    select: { draftSchema: true },
  })

  const schema = row.draftSchema as { nodes: Record<string, { metadata?: { name?: string } }> }

  return Object.values(schema.nodes)
    .map((node) => node.metadata?.name)
    .filter((name): name is string => name !== undefined)
}

async function recoveryRevisions(pageId: string) {
  return prisma.revision.findMany({
    where: { pageId, kind: "recovery" },
    orderBy: { number: "asc" },
    select: { name: true, schema: true },
  })
}

function namesIn(schema: unknown): readonly string[] {
  const parsed = schema as { nodes: Record<string, { metadata?: { name?: string } }> }

  return Object.values(parsed.nodes)
    .map((node) => node.metadata?.name)
    .filter((name): name is string => name !== undefined)
}

async function rename(page: Page, from: string, to: string): Promise<void> {
  await layerRow(page, from).click()
  await page.keyboard.press("F2")

  const field = page.getByRole("textbox", { name: `Rename ${from}` })

  await expect(field).toBeFocused()
  await field.fill(to)
  await field.press("Enter")
}

test("a refused write asks which version survives", async ({ context, page }) => {
  const pageId = await openPage(context, page)

  await theOtherSessionRenames(pageId, "Theirs")
  await rename(page, "Left", "Mine")

  // The write goes out after the debounce and comes back refused.
  //
  // Scoped to the dialog: the status bar says the same sentence, which is the
  // point of it — but it means the bare text matches twice.
  const prompt = page.getByRole("dialog")

  await expect(prompt).toBeVisible({ timeout: 20_000 })
  await expect(prompt.getByText("This page was changed in another session")).toBeVisible()

  // Both sides' changes, worked out from the version only this session holds.
  await expect(prompt.getByText("Their changes")).toBeVisible()
  await expect(prompt.getByText("Your changes")).toBeVisible()
  await expect(prompt.getByText(/restorable snapshot/)).toBeVisible()
})

test("keeping mine writes mine and keeps theirs restorable", async ({ context, page }) => {
  const pageId = await openPage(context, page)

  await theOtherSessionRenames(pageId, "Theirs")
  await rename(page, "Left", "Mine")

  await expect(page.getByRole("button", { name: "Keep mine" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole("button", { name: "Keep mine" }).click()

  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 20_000 })

  const names = await storedNames(pageId)

  expect(names).toContain("Mine")

  /*
   * The half that matters.
   *
   * Their work was replaced, so it has to exist as a revision — a resolution
   * that lands the right document and loses the other one is the failure this
   * feature exists to prevent.
   */
  const kept = await recoveryRevisions(pageId)

  expect(kept).toHaveLength(1)
  expect(kept[0]?.name).toMatch(/^Replaced in conflict/)
  expect(namesIn(kept[0]?.schema)).toContain("Theirs")
})

test("using theirs loads theirs and keeps mine restorable", async ({ context, page }) => {
  const pageId = await openPage(context, page)

  await theOtherSessionRenames(pageId, "Theirs")
  await rename(page, "Left", "Mine")

  await expect(page.getByRole("button", { name: "Use theirs" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole("button", { name: "Use theirs" }).click()

  // Their document is now the one in the editor.
  await expect(layerRow(page, "Theirs")).toBeVisible({
    timeout: 20_000,
  })
  await expect(layerRow(page, "Mine")).toBeHidden()

  const kept = await recoveryRevisions(pageId)

  expect(kept).toHaveLength(1)
  expect(kept[0]?.name).toMatch(/^Discarded in conflict/)
  // Given up in the editor, not given up altogether.
  expect(namesIn(kept[0]?.schema)).toContain("Mine")
})

test("autosave works again once the conflict is resolved", async ({ context, page }) => {
  const pageId = await openPage(context, page)

  await theOtherSessionRenames(pageId, "Theirs")
  await rename(page, "Left", "Mine")

  await expect(page.getByRole("button", { name: "Keep mine" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole("button", { name: "Keep mine" }).click()
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 20_000 })

  // The next write has to be made against the version resolving produced, or
  // the editor conflicts with itself for the rest of the session.
  await rename(page, "Mine", "After")

  await expect(page.getByText("Unsaved changes", { exact: true })).toBeHidden({ timeout: 20_000 })
  expect(await storedNames(pageId)).toContain("After")
})

test("the prompt can be put aside and brought back", async ({ context, page }) => {
  const pageId = await openPage(context, page)

  await theOtherSessionRenames(pageId, "Theirs")
  await rename(page, "Left", "Mine")

  await expect(page.getByRole("button", { name: "Keep mine" })).toBeVisible({ timeout: 20_000 })

  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Keep mine" })).toBeHidden()

  // Autosave stays stopped, so the status bar has to offer the way back.
  await page.getByRole("button", { name: "Resolve" }).click()

  await expect(page.getByRole("button", { name: "Keep mine" })).toBeVisible()
})
