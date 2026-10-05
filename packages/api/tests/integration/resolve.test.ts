import { beforeEach, describe, expect, it } from "vitest"
import { prisma, type TenantContext } from "@checkout-studio/database"
import { serialize, type CheckoutSchema } from "@checkout-studio/schema"

import { readDraft, saveDraft } from "../../src/services/pages/draft"
import { resolveConflict } from "../../src/services/pages/resolve"

/**
 * Resolving a draft conflict, against a real database.
 *
 * One property matters more than all the others: **no resolution path discards
 * work.** Whichever side is not kept has to exist as a revision before anything
 * is overwritten, so every test here checks the revision as well as the draft —
 * a resolution that lands the right document and loses the other one is the
 * failure this feature exists to prevent.
 */

function document(text: string): CheckoutSchema {
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
      email: `resolve-${Date.now()}@example.test`,
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
      draftSchema: JSON.parse(serialize(document("Theirs"))) as object,
    },
  })

  tenant = { userId: user.id, projectId: project.id }
  pageId = page.id
})

/** The text of the one heading, as stored. */
async function storedText(): Promise<string | undefined> {
  const draft = await readDraft(tenant, pageId)

  return draft?.document.nodes["heading"]?.props["text"] as string | undefined
}

async function revisions() {
  return prisma.revision.findMany({
    where: { pageId },
    orderBy: { number: "asc" },
    select: { id: true, kind: true, name: true, schema: true, rendererVersion: true },
  })
}

function textOf(schema: unknown): string {
  const parsed = schema as { nodes: Record<string, { props: { text?: string } }> }

  return parsed.nodes["heading"]?.props.text ?? ""
}

describe("keeping mine", () => {
  it("writes my document as the draft", async () => {
    const result = await resolveConflict(tenant, pageId, {
      resolution: "mine",
      document: document("Mine"),
    })

    expect(result.ok).toBe(true)
    expect(await storedText()).toBe("Mine")
  })

  it("keeps theirs as a recovery revision first", async () => {
    await resolveConflict(tenant, pageId, { resolution: "mine", document: document("Mine") })

    const kept = await revisions()

    expect(kept).toHaveLength(1)
    expect(kept[0]?.kind).toBe("recovery")
    // The side that was replaced, not the side that won.
    expect(textOf(kept[0]?.schema)).toBe("Theirs")
  })

  it("names the revision so it can be recognised later", async () => {
    await resolveConflict(tenant, pageId, {
      resolution: "mine",
      document: document("Mine"),
      now: new Date("2026-10-05T14:22:00Z"),
    })

    const [kept] = await revisions()

    expect(kept?.name).toMatch(/^Replaced in conflict — /)
    expect(kept?.name).toContain("2026")
  })

  it("moves the version on, so the next write is against the right one", async () => {
    const before = await readDraft(tenant, pageId)
    const result = await resolveConflict(tenant, pageId, {
      resolution: "mine",
      document: document("Mine"),
    })

    expect(result.ok && result.draftVersion).toBeGreaterThan(before?.draftVersion ?? 0)

    // And the editor can write again immediately, which it could not before.
    const next = await saveDraft(tenant, pageId, {
      baseVersion: result.ok ? result.draftVersion : 0,
      patch: [{ op: "replace", path: "/nodes/heading/props/text", value: "After" }],
    })

    expect(next.ok).toBe(true)
  })

  it("records which renderer produced the snapshot", async () => {
    await resolveConflict(tenant, pageId, { resolution: "mine", document: document("Mine") })

    const [kept] = await revisions()

    // A revision has to be able to say what could open it.
    expect(kept?.rendererVersion).toBe("1.0.0")
  })
})

describe("using theirs", () => {
  it("leaves their document as the draft", async () => {
    const result = await resolveConflict(tenant, pageId, {
      resolution: "theirs",
      document: document("Mine"),
    })

    expect(result.ok).toBe(true)
    expect(await storedText()).toBe("Theirs")
    expect(result.ok && textOf(result.document)).toBe("Theirs")
  })

  it("keeps mine as a recovery revision rather than dropping it", async () => {
    await resolveConflict(tenant, pageId, { resolution: "theirs", document: document("Mine") })

    const kept = await revisions()

    expect(kept).toHaveLength(1)
    expect(kept[0]?.kind).toBe("recovery")
    // The whole point: the side that was given up is restorable.
    expect(textOf(kept[0]?.schema)).toBe("Mine")
    expect(kept[0]?.name).toMatch(/^Discarded in conflict — /)
  })

  it("does not move the version, because nothing was written", async () => {
    const before = await readDraft(tenant, pageId)
    const result = await resolveConflict(tenant, pageId, {
      resolution: "theirs",
      document: document("Mine"),
    })

    expect(result.ok && result.draftVersion).toBe(before?.draftVersion)
  })
})

describe("refusing", () => {
  it("refuses a document that is not a page, either way round", async () => {
    for (const resolution of ["mine", "theirs"] as const) {
      const result = await resolveConflict(tenant, pageId, {
        resolution,
        document: { nonsense: true },
      })

      expect(result.ok).toBe(false)
      expect(!result.ok && result.reason).toBe("invalid")
    }

    // Nothing stored, and nothing snapshotted: a recovery revision that cannot
    // be opened is not a recovery.
    expect(await revisions()).toEqual([])
    expect(await storedText()).toBe("Theirs")
  })

  it("refuses a document whose tree is broken, not just its shape", async () => {
    const orphaned = document("Mine")
    const broken = {
      ...orphaned,
      nodes: {
        ...orphaned.nodes,
        stray: { ...orphaned.nodes["heading"]!, id: "stray", parentId: "nowhere" },
      },
    }

    const result = await resolveConflict(tenant, pageId, {
      resolution: "mine",
      document: broken,
    })

    expect(!result.ok && result.reason).toBe("invalid")
    expect(await storedText()).toBe("Theirs")
  })

  it("says so for a page that is not there", async () => {
    const result = await resolveConflict(tenant, "pag_nowhere", {
      resolution: "mine",
      document: document("Mine"),
    })

    expect(!result.ok && result.reason).toBe("missing")
  })

  it("is invisible to another tenant", async () => {
    const result = await resolveConflict({ userId: "user_other" }, pageId, {
      resolution: "mine",
      document: document("Mine"),
    })

    // Invisible rather than forbidden, which is what stops an endpoint from
    // revealing that a page exists.
    expect(!result.ok && result.reason).toBe("missing")
    expect(await revisions()).toEqual([])
  })
})

describe("a third write landing before the decision", () => {
  it("becomes the snapshot rather than being lost", async () => {
    const stored = await readDraft(tenant, pageId)

    // What a third session does while somebody is looking at the prompt.
    await saveDraft(tenant, pageId, {
      baseVersion: stored?.draftVersion ?? 0,
      patch: [{ op: "replace", path: "/nodes/heading/props/text", value: "A third" }],
    })

    const result = await resolveConflict(tenant, pageId, {
      resolution: "mine",
      document: document("Mine"),
    })

    /*
     * Resolving re-reads the draft rather than trusting whatever the prompt was
     * shown, so what gets snapshotted is what is actually there — the third
     * session's document, not the one the person was comparing against.
     *
     * Their work is given up by this choice, which is what "keep mine" means.
     * What matters is that giving it up puts it somewhere restorable.
     */
    expect(result.ok).toBe(true)
    expect(await storedText()).toBe("Mine")

    const kept = await revisions()

    expect(textOf(kept[kept.length - 1]?.schema)).toBe("A third")
  })

  it("is refused when it lands between the snapshot and the write", async () => {
    /*
     * The narrow race the version check covers.
     *
     * Resolving writes against the version it read, so a write that lands in
     * that window is refused rather than overwritten — the prompt has to be
     * asked again against the version that won.
     */
    const stored = await readDraft(tenant, pageId)

    expect(stored).not.toBeNull()

    // Reproduced by handing the repository a version that has already moved on,
    // which is exactly what the service would be holding.
    await saveDraft(tenant, pageId, {
      baseVersion: stored!.draftVersion,
      patch: [{ op: "replace", path: "/nodes/heading/props/text", value: "A third" }],
    })

    const stale = await saveDraft(tenant, pageId, {
      baseVersion: stored!.draftVersion,
      patch: [{ op: "replace", path: "/nodes/heading/props/text", value: "Mine" }],
    })

    expect(stale.ok).toBe(false)
    expect(!stale.ok && stale.reason).toBe("conflict")
  })
})
