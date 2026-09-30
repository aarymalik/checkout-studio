import { beforeEach, describe, expect, it } from "vitest"
import { prisma, type TenantContext } from "@checkout-studio/database"
import { serialize, type CheckoutSchema } from "@checkout-studio/schema"

import { readDraft, saveDraft } from "../../src/services/pages/draft"

/**
 * Writing the draft, against a real database.
 *
 * There is no unconditional write path. What this suite is really protecting is
 * that two sessions racing cannot both believe they won, and that no rejected
 * write leaves the stored page worse than it was.
 */

function document(text = "Original"): CheckoutSchema {
  return {
    version: "1.0.0",
    projectId: "prj_test",
    pageId: "pag_test",
    theme: { themeId: "theme_test" },
    settings: {},
    variables: {},
    root: "root",
    nodes: {
      root: {
        id: "root",
        type: "core.page",
        parentId: null,
        children: ["heading"],
        props: {},
        styles: {},
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false },
      },
      heading: {
        id: "heading",
        type: "core.heading",
        parentId: "root",
        children: [],
        props: { text },
        styles: {},
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false },
      },
    },
  }
}

let tenant: TenantContext
let pageId: string

beforeEach(async () => {
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `draft-${Date.now()}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })

  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${Date.now()}` },
  })

  const page = await prisma.page.create({
    data: {
      projectId: project.id,
      title: "Checkout",
      slug: "checkout",
      draftSchema: JSON.parse(serialize(document())) as object,
    },
  })

  tenant = { userId: user.id, projectId: project.id }
  pageId = page.id
})

const rename = (text: string) => [
  { op: "replace" as const, path: "/nodes/heading/props/text", value: text },
]

describe("reading", () => {
  it("returns the draft and its version", async () => {
    const stored = await readDraft(tenant, pageId)

    expect(stored?.draftVersion).toBe(0)
    expect(stored?.document.nodes["heading"]?.props["text"]).toBe("Original")
  })

  it("returns nothing for a page that is not there", async () => {
    expect(await readDraft(tenant, "pag_nowhere")).toBeNull()
  })

  // Invisible rather than forbidden, which is what stops an endpoint from
  // revealing that a page exists.
  it("returns nothing for another tenant's page", async () => {
    expect(await readDraft({ userId: "user_other" }, pageId)).toBeNull()
  })

  // Handing the editor something it cannot read is worse than saying so.
  it("returns nothing when the stored draft does not parse", async () => {
    await prisma.page.update({ where: { id: pageId }, data: { draftSchema: { nonsense: true } } })

    expect(await readDraft(tenant, pageId)).toBeNull()
  })
})

describe("writing", () => {
  it("applies a patch and advances the version", async () => {
    const result = await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Updated") })

    expect(result).toMatchObject({ ok: true, draftVersion: 1 })
    expect((await readDraft(tenant, pageId))?.document.nodes["heading"]?.props["text"]).toBe(
      "Updated",
    )
  })

  it("advances once per write", async () => {
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("One") })
    const second = await saveDraft(tenant, pageId, { baseVersion: 1, patch: rename("Two") })

    expect(second).toMatchObject({ ok: true, draftVersion: 2 })
  })

  /*
   * Not byte-for-byte: jsonb stores an object, not the text of one, and
   * Postgres returns keys in its own order. That is precisely why the schema
   * has a canonical form — comparing documents by their stored bytes would
   * report a change on every read.
   */
  it("stores a document that reads back as the same page", async () => {
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Updated") })

    const stored = await readDraft(tenant, pageId)

    expect(serialize(stored?.document as CheckoutSchema)).toBe(serialize(document("Updated")))
  })

  it("refuses a page that is not there", async () => {
    const result = await saveDraft(tenant, "pag_nowhere", { baseVersion: 0, patch: rename("x") })

    expect(result).toMatchObject({ ok: false, reason: "unpatchable" })
  })
})

describe("conflict", () => {
  // The case the whole mechanism exists for: two sessions, one version.
  it("rejects a write made against a version that has moved on", async () => {
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Theirs") })

    const mine = await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Mine") })

    expect(mine).toMatchObject({ ok: false, reason: "conflict", currentVersion: 1 })
  })

  /*
   * The server cannot describe the conflict, and does not pretend to. A draft
   * write creates no revision, so there is nothing here to reconstruct the
   * caller's `baseVersion` from — only the caller still holds the document it
   * started from. What comes back is the winning document, which is what the
   * editor needs to diff against its own.
   */
  it("hands back what it cannot describe", async () => {
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Theirs") })

    const mine = await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Mine") })

    expect(mine.ok).toBe(false)
    expect(mine.ok ? null : "current" in mine ? mine.current : null).not.toBeNull()
  })

  // Neither version is lost: the caller is handed the one it does not have.
  it("returns the version that won, so nothing has to be refetched", async () => {
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Theirs") })

    const mine = await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Mine") })

    expect(
      mine.ok ? null : "current" in mine ? mine.current.nodes["heading"]?.props["text"] : null,
    ).toBe("Theirs")
  })

  it("leaves the stored draft untouched", async () => {
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Theirs") })
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Mine") })

    expect((await readDraft(tenant, pageId))?.document.nodes["heading"]?.props["text"]).toBe(
      "Theirs",
    )
  })

  it("does not advance the version on a rejected write", async () => {
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Theirs") })
    await saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Mine") })

    expect((await readDraft(tenant, pageId))?.draftVersion).toBe(1)
  })

  // Only one of two simultaneous writes may win.
  it("lets exactly one of two racing writes succeed", async () => {
    const [first, second] = await Promise.all([
      saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("One") }),
      saveDraft(tenant, pageId, { baseVersion: 0, patch: rename("Two") }),
    ])

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)
  })
})

describe("refusing a patch that would break the page", () => {
  /*
   * A page that cannot be opened is a far worse outcome than a rejected save,
   * so the result is validated before anything is stored.
   */
  it("refuses a patch that orphans a node", async () => {
    const result = await saveDraft(tenant, pageId, {
      baseVersion: 0,
      patch: [{ op: "replace", path: "/nodes/root/children", value: [] }],
    })

    expect(result).toMatchObject({ ok: false, reason: "invalid" })
    expect(result.ok ? [] : "problems" in result ? result.problems[0]?.code : []).toBe("orphan")
  })

  it("refuses a patch that removes the root", async () => {
    const result = await saveDraft(tenant, pageId, {
      baseVersion: 0,
      patch: [{ op: "replace", path: "/root", value: "nowhere" }],
    })

    expect(result).toMatchObject({ ok: false, reason: "invalid" })
  })

  it("refuses a patch that produces something that is not a page", async () => {
    const result = await saveDraft(tenant, pageId, {
      baseVersion: 0,
      patch: [{ op: "replace", path: "/version", value: 42 }],
    })

    expect(result).toMatchObject({ ok: false, reason: "invalid" })
  })

  it("refuses a patch that points at something that is not there", async () => {
    const result = await saveDraft(tenant, pageId, {
      baseVersion: 0,
      patch: [{ op: "replace", path: "/nodes/nowhere/props/text", value: "x" }],
    })

    expect(result).toMatchObject({ ok: false, reason: "unpatchable" })
  })

  it("leaves the stored draft untouched when a patch is refused", async () => {
    await saveDraft(tenant, pageId, {
      baseVersion: 0,
      patch: [{ op: "replace", path: "/nodes/root/children", value: [] }],
    })

    const stored = await readDraft(tenant, pageId)

    expect(stored?.draftVersion).toBe(0)
    expect(stored?.document.nodes["heading"]?.props["text"]).toBe("Original")
  })
})
