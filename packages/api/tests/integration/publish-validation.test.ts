import { beforeEach, describe, expect, it } from "vitest"
import { prisma, type TenantContext } from "@checkout-studio/database"
import type { DocumentValidatorRegistration } from "@checkout-studio/plugin-sdk"
import { createDocument, serialize } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { validateForPublish } from "../../src/services/publishing/validate"

/**
 * Whether a page can go live.
 *
 * The rules a plugin contributes are tested where they are written. What is
 * only true here is the join: that engine problems and plugin problems come
 * back in one list, that severity decides whether the publish is blocked,
 * and that a warning survives a page being fine.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

/** A validator standing in for a plugin's, so the seam is exercised. */
function rule(
  name: string,
  severity: "info" | "warning" | "error" | "critical",
): DocumentValidatorRegistration {
  return {
    rule: name,
    label: name,
    validate: () => [{ rule: name, severity, message: `${name} fired`, nodeIds: [] }],
  }
}

const SILENT: DocumentValidatorRegistration = {
  rule: "test.silent",
  label: "silent",
  validate: () => [],
}

async function aPage(schema: unknown): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId: tenant.projectId,
      title: "Checkout",
      slug: `checkout-${String(Date.now())}-${String(counter)}`,
      draftSchema: schema as never,
    },
  })

  return page.id
}

function aDocument(): CheckoutSchema {
  return createDocument({ projectId: tenant.projectId, pageId: "pag_x", themeId: "theme_default" })
}

/** Through serialize, so what is stored is what the product would store. */
function stored(document: CheckoutSchema): unknown {
  return JSON.parse(serialize(document))
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.asset.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `publish-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("a page that can go live", () => {
  it("comes back with the document, so the caller need not read it again", async () => {
    const result = await validateForPublish(tenant, await aPage(stored(aDocument())), [SILENT])

    expect(result).toMatchObject({ ok: true })

    if (!result.ok) return

    expect(result.document.projectId).toBe(tenant.projectId)
  })

  it("brings its warnings with it", async () => {
    const result = await validateForPublish(tenant, await aPage(stored(aDocument())), [
      rule("test.nitpick", "warning"),
      rule("test.aside", "info"),
    ])

    expect(result).toMatchObject({ ok: true })

    if (!result.ok) return

    /*
     * Dropping these would make the only way to see a warning be to have an
     * error beside it.
     */
    expect(result.warnings.map((issue) => issue.rule)).toEqual(["test.nitpick", "test.aside"])
  })
})

describe("a page that cannot", () => {
  it("is blocked by a plugin's error", async () => {
    const result = await validateForPublish(tenant, await aPage(stored(aDocument())), [
      rule("test.broken", "error"),
    ])

    expect(result).toMatchObject({ ok: false, reason: "blocked" })

    if (result.ok || result.reason !== "blocked") return

    expect(result.issues.map((issue) => issue.rule)).toEqual(["test.broken"])
  })

  it("is blocked by a plugin's critical too", async () => {
    const result = await validateForPublish(tenant, await aPage(stored(aDocument())), [
      rule("test.dire", "critical"),
    ])

    expect(result).toMatchObject({ ok: false, reason: "blocked" })
  })

  it("says so plainly when the draft cannot be read", async () => {
    const result = await validateForPublish(tenant, await aPage({ not: "a document" }), [SILENT])

    expect(result).toMatchObject({ ok: false, reason: "blocked" })

    if (result.ok || result.reason !== "blocked") return

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.rule).toBe("engine.unreadable")
    // The schema's paths are not passed through: nobody reading a publish
    // screen can act on something more precise than "it cannot be opened".
    expect(JSON.stringify(result.issues)).not.toContain("nodes.")
  })

  it("runs no validators on a draft that did not parse", async () => {
    let ran = false
    const watcher: DocumentValidatorRegistration = {
      rule: "test.watcher",
      label: "watcher",
      validate: () => {
        ran = true

        return []
      },
    }

    await validateForPublish(tenant, await aPage({ not: "a document" }), [watcher])

    // There is no document to hand them. Calling one anyway would mean every
    // plugin validator needed a guard for a case it cannot be given.
    expect(ran).toBe(false)
  })

  it("is blocked by a tree that does not hold together", async () => {
    const document = aDocument()
    // The root naming a node that is not there. Shaped correctly, so it
    // parses — which is the point: this is the walk `parseDocument` does
    // not do.
    const broken = { ...document, root: "nd_nothing" }

    const result = await validateForPublish(
      tenant,
      await aPage(JSON.parse(JSON.stringify(broken))),
      [SILENT],
    )

    expect(result).toMatchObject({ ok: false, reason: "blocked" })

    if (result.ok || result.reason !== "blocked") return

    expect(result.issues.some((issue) => issue.rule === "engine.broken-reference")).toBe(true)
  })

  it("is nothing for a page somebody else owns", async () => {
    const stranger = await prisma.user.create({
      data: {
        email: `other-${String(Date.now())}@example.test`,
        passwordHash: "fixture:no-password",
        emailVerifiedAt: new Date(),
      },
    })
    const theirProject = await prisma.project.create({
      data: { userId: stranger.id, name: "Theirs", slug: `theirs-${String(Date.now())}` },
    })
    const theirPage = await prisma.page.create({
      data: {
        projectId: theirProject.id,
        title: "Theirs",
        slug: `theirs-${String(Date.now())}`,
        draftSchema: {},
      },
    })

    expect(await validateForPublish(tenant, theirPage.id, [SILENT])).toEqual({
      ok: false,
      reason: "not-found",
    })
  })
})

describe("the pictures a page draws", () => {
  async function anAsset(): Promise<string> {
    counter += 1
    const sha256 = String(counter).padEnd(64, "0")

    const asset = await prisma.asset.create({
      data: {
        projectId: tenant.projectId,
        fileName: "hero.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1_000,
        storageKey: `assets/${sha256}.jpg`,
        url: `https://assets.invalid/${sha256}.jpg`,
        sha256,
        renditions: [],
      },
    })

    return asset.id
  }

  /** A document whose root node draws an asset, in the shape the walk reads. */
  function drawing(assetId: string): { document: CheckoutSchema; nodeId: string } {
    const document = aDocument()
    const nodeId = document.root
    const root = document.nodes[nodeId]

    if (root === undefined) throw new Error("the fixture has no root")

    return {
      nodeId,
      document: {
        ...document,
        nodes: {
          ...document.nodes,
          [nodeId]: { ...root, props: { ...root.props, backgroundImage: { $asset: assetId } } },
        },
      },
    }
  }

  it("passes when the project still has them", async () => {
    const page = await aPage(stored(drawing(await anAsset()).document))

    expect(await validateForPublish(tenant, page, [SILENT])).toMatchObject({ ok: true })
  })

  it("is blocked when one was deleted out from under it", async () => {
    const assetId = await anAsset()
    const { document, nodeId } = drawing(assetId)
    const pageId = await aPage(stored(document))

    await prisma.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } })

    const result = await validateForPublish(tenant, pageId, [SILENT])

    expect(result).toMatchObject({ ok: false, reason: "blocked" })

    if (result.ok || result.reason !== "blocked") return

    const issue = result.issues.find((entry) => entry.rule === "engine.missing-asset")

    expect(issue).toBeDefined()
    /*
     * The node that draws it, taken from the fixture rather than from the
     * issue — an assertion comparing the answer to itself would pass
     * whatever node it named.
     */
    expect(issue?.nodeIds).toEqual([nodeId])
  })

  it("asks nothing of the database for a page that draws none", async () => {
    // Most pages. The repository short-circuits an empty list, and this is
    // the caller's half of that: no walk, no query, no issue.
    const result = await validateForPublish(tenant, await aPage(stored(aDocument())), [SILENT])

    expect(result).toMatchObject({ ok: true })
  })
})
