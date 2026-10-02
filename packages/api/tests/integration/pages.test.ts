import { beforeEach, describe, expect, it } from "vitest"
import { prisma, type TenantContext } from "@checkout-studio/database"
import { parseDocument } from "@checkout-studio/schema"

import {
  createPage,
  deletePage,
  duplicatePage,
  listPages,
  renamePage,
  setPageSlug,
} from "../../src/services/pages/pages"
import { readDraft, saveDraft } from "../../src/services/pages/draft"

/**
 * Pages.
 *
 * A page is a row plus the document it owns. What these protect is that the two
 * never come apart: no page exists without a document it can open, and no copy
 * is made from a draft that cannot be read.
 */

let tenant: TenantContext

/** The project under test. Narrowed, because a tenant's project is optional. */
function projectId(): string {
  if (tenant.projectId === undefined) throw new Error("The fixture has no project.")

  return tenant.projectId
}

beforeEach(async () => {
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `pages-${Date.now()}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })

  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${Date.now()}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("creating", () => {
  it("creates a page with a document it can open", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    const draft = await readDraft(tenant, page.id)

    expect(page).toMatchObject({ title: "Checkout", slug: "checkout", status: "draft" })
    expect(draft?.document.pageId).toBe(page.id)
    expect(Object.keys(draft?.document.nodes ?? {})).toHaveLength(1)
  })

  // A page that arrives with a heading somebody did not ask for is a page they
  // have to empty before they can start.
  it("creates it empty, with one root", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    const draft = await readDraft(tenant, page.id)
    const root = draft?.document.nodes[draft.document.root]

    expect(root?.type).toBe("core.page")
    expect(root?.children).toEqual([])
  })

  it("gives each page its own slug", async () => {
    const first = await createPage(tenant, { title: "Checkout" })
    const second = await createPage(tenant, { title: "Checkout" })

    expect(first.slug).toBe("checkout")
    expect(second.slug).toBe("checkout-2")
  })

  it("gives a deleted page's slug back", async () => {
    // Deleting a page frees its URL. A deleted page serves nothing — the
    // published route filters on status and deletedAt both — so holding its
    // address would leave a URL nobody can reclaim, for no benefit.
    const first = await createPage(tenant, { title: "Checkout" })
    await deletePage(tenant, first.id)

    const second = await createPage(tenant, { title: "Checkout" })

    expect(second.slug).toBe(first.slug)
    expect(second.id).not.toBe(first.id)
  })

  it("lets a deleted page and a live one share a slug", async () => {
    const first = await createPage(tenant, { title: "Checkout" })
    await deletePage(tenant, first.id)
    const second = await createPage(tenant, { title: "Checkout" })

    const rows = await prisma.page.findMany({
      where: { projectId: projectId(), slug: "checkout" },
      select: { id: true },
    })

    // Both rows exist with the same slug. The index permits it because only
    // one of them is live.
    expect(rows.map((row) => row.id).sort()).toEqual([first.id, second.id].sort())
  })

  it("still refuses two live pages at the same address", async () => {
    await createPage(tenant, { title: "Checkout" })
    const second = await createPage(tenant, { title: "Checkout" })

    // The constraint is about live pages, and it still binds them.
    expect(second.slug).toBe("checkout-2")
    await expect(
      prisma.page.update({ where: { id: second.id }, data: { slug: "checkout" } }),
    ).rejects.toThrow()
  })

  it("gives a deleted copy's slug back when duplicating again", async () => {
    const first = await createPage(tenant, { title: "Checkout" })
    const copy = await duplicatePage(tenant, first.id)

    expect(copy.ok).toBe(true)
    if (!copy.ok) return

    await deletePage(tenant, copy.page.id)

    const again = await duplicatePage(tenant, first.id)

    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.page.slug).toBe(copy.page.slug)
  })

  it("falls back for a title that slugifies to nothing", async () => {
    expect((await createPage(tenant, { title: "！！！" })).slug).toBe("page")
  })

  it("points the document at the theme it was given", async () => {
    const page = await createPage(tenant, { title: "Checkout", themeId: "theme_brand" })

    expect((await readDraft(tenant, page.id))?.document.theme.themeId).toBe("theme_brand")
  })
})

describe("moving a page to another address", () => {
  it("changes the slug and leaves the title alone", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    const moved = await setPageSlug(tenant, page.id, "black-friday")

    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.page.slug).toBe("black-friday")
    expect(moved.page.title).toBe("Checkout")
  })

  it("slugifies what it is given", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    // Somebody typing "Black Friday" into a URL field means black-friday, and
    // refusing it to make a point would be pedantry.
    const moved = await setPageSlug(tenant, page.id, "  Black Friday!  ")

    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.page.slug).toBe("black-friday")
  })

  it("refuses an address with nothing in it", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    expect(await setPageSlug(tenant, page.id, "！！！")).toEqual({ ok: false, reason: "empty" })
  })

  it("refuses an address another live page already answers to", async () => {
    await createPage(tenant, { title: "Checkout" })
    const second = await createPage(tenant, { title: "Thanks" })

    expect(await setPageSlug(tenant, second.id, "checkout")).toEqual({
      ok: false,
      reason: "taken",
    })
  })

  it("allows an address only a deleted page holds", async () => {
    const first = await createPage(tenant, { title: "Checkout" })
    const second = await createPage(tenant, { title: "Thanks" })
    await deletePage(tenant, first.id)

    const moved = await setPageSlug(tenant, second.id, "checkout")

    expect(moved.ok).toBe(true)
  })

  it("is content for a page to keep the address it has", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    // Not a collision with itself, which a naive uniqueness check would call
    // one — and the user would be told their own address was taken.
    const moved = await setPageSlug(tenant, page.id, "checkout")

    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.page.slug).toBe("checkout")
  })

  it("moves the published URL with it", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    await setPageSlug(tenant, page.id, "black-friday")

    // The slug is the address the published route resolves, so a move is a
    // move. The interface warns before doing this to a live page.
    const row = await prisma.page.findUniqueOrThrow({ where: { id: page.id } })
    expect(row.slug).toBe("black-friday")
  })

  it("says nothing of a page in another tenant's project", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    expect(await setPageSlug({ userId: "someone-else" }, page.id, "mine")).toEqual({
      ok: false,
      reason: "not-found",
    })
  })
})

describe("listing", () => {
  it("returns nothing for a project with no pages", async () => {
    expect(await listPages(tenant)).toEqual([])
  })

  it("returns the most recently changed first", async () => {
    const first = await createPage(tenant, { title: "One" })
    const second = await createPage(tenant, { title: "Two" })

    const listed = await listPages(tenant)

    expect(listed.map((page) => page.id)).toEqual([second.id, first.id])
  })

  it("leaves out a deleted page", async () => {
    const page = await createPage(tenant, { title: "One" })
    await createPage(tenant, { title: "Two" })
    await deletePage(tenant, page.id)

    expect((await listPages(tenant)).map((item) => item.title)).toEqual(["Two"])
  })

  // Invisible rather than forbidden.
  it("shows nothing of another tenant's project", async () => {
    await createPage(tenant, { title: "One" })

    expect(await listPages({ userId: "user_other", projectId: projectId() })).toEqual([])
  })
})

describe("renaming", () => {
  it("changes the title", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    expect(await renamePage(tenant, page.id, "Order form")).toMatchObject({ title: "Order form" })
  })

  // A published page's URL is a link somebody may have shared.
  it("does not move the page's URL", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    const renamed = await renamePage(tenant, page.id, "Order form")

    expect(renamed?.slug).toBe("checkout")
  })

  /*
   * A rename during somebody's editing session must not invalidate their next
   * save: it is not a draft write, and the version is what tells two writers
   * apart.
   */
  it("leaves the draft version alone", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    const before = (await readDraft(tenant, page.id))?.draftVersion

    await renamePage(tenant, page.id, "Order form")

    expect((await readDraft(tenant, page.id))?.draftVersion).toBe(before)
  })

  it("refuses a page that is not there", async () => {
    expect(await renamePage(tenant, "pag_nowhere", "Nothing")).toBeNull()
  })

  it("refuses another tenant's page", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    expect(await renamePage({ userId: "user_other" }, page.id, "Theirs")).toBeNull()
  })
})

describe("duplicating", () => {
  it("copies the document, not just the row", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    const draft = await readDraft(tenant, page.id)

    await saveDraft(tenant, page.id, {
      baseVersion: draft?.draftVersion ?? 0,
      patch: [
        {
          op: "add",
          path: `/nodes/${draft?.document.root}/props/text`,
          value: "Hello",
        },
      ],
    })

    const copy = await duplicatePage(tenant, page.id)

    expect(copy.ok).toBe(true)

    const copied = copy.ok ? await readDraft(tenant, copy.page.id) : null

    expect(copied?.document.nodes[copied.document.root]?.props["text"]).toBe("Hello")
  })

  it("names and slugs the copy", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    const copy = await duplicatePage(tenant, page.id)

    expect(copy.ok && copy.page).toMatchObject({ title: "Checkout copy", slug: "checkout-copy" })
  })

  it("points the copy at itself", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    const copy = await duplicatePage(tenant, page.id)
    const copied = copy.ok ? await readDraft(tenant, copy.page.id) : null

    expect(copied?.document.pageId).toBe(copy.ok ? copy.page.id : null)
  })

  it("leaves the original alone", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    await duplicatePage(tenant, page.id)

    expect((await readDraft(tenant, page.id))?.document.pageId).toBe(page.id)
    expect((await listPages(tenant)).find((item) => item.id === page.id)?.title).toBe("Checkout")
  })

  it("can be duplicated again", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    await duplicatePage(tenant, page.id)

    const second = await duplicatePage(tenant, page.id)

    expect(second.ok && second.page.slug).toBe("checkout-copy-2")
  })

  it("refuses a page that is not there", async () => {
    expect(await duplicatePage(tenant, "pag_nowhere")).toEqual({
      ok: false,
      reason: "not-found",
    })
  })

  /*
   * Creating an empty page named "Checkout copy" would look like success and
   * lose everything the original held.
   */
  it("refuses a draft it cannot read", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    await prisma.page.update({
      where: { id: page.id },
      data: { draftSchema: { nonsense: true } },
    })

    expect(await duplicatePage(tenant, page.id)).toEqual({ ok: false, reason: "unreadable" })
    expect(await listPages(tenant)).toHaveLength(1)
  })
})

describe("deleting", () => {
  // The row stays, marked. Nothing anybody spent an afternoon on is removed by
  // one click.
  it("hides the page without removing the row", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    expect(await deletePage(tenant, page.id)).toBe(true)
    expect(await listPages(tenant)).toEqual([])
    expect(await prisma.page.count({ where: { id: page.id } })).toBe(1)
  })

  it("reports that there was nothing to delete", async () => {
    expect(await deletePage(tenant, "pag_nowhere")).toBe(false)
  })

  it("refuses another tenant's page", async () => {
    const page = await createPage(tenant, { title: "Checkout" })

    expect(await deletePage({ userId: "user_other" }, page.id)).toBe(false)
  })

  it("makes the draft unreadable afterwards", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    await deletePage(tenant, page.id)

    expect(await readDraft(tenant, page.id)).toBeNull()
  })
})

describe("the document a page carries", () => {
  it("parses back to exactly what was stored", async () => {
    const page = await createPage(tenant, { title: "Checkout" })
    const row = await prisma.page.findFirstOrThrow({ where: { id: page.id } })

    expect(parseDocument(row.draftSchema).ok).toBe(true)
  })
})
