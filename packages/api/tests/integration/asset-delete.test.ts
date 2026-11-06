import { beforeEach, describe, expect, it } from "vitest"
import { assetRepository, prisma, type TenantContext } from "@checkout-studio/database"
import { serialize, type CheckoutSchema, type PropValue } from "@checkout-studio/schema"

import { deleteAsset } from "../../src/services/assets/delete"
import { UnreadableDocumentError } from "../../src/services/assets/usage"

/**
 * Taking an asset out of the library, against a real database.
 *
 * What this is about is the refusal: which documents count as using a
 * picture, and what the merchant is told when one does. The walk itself is
 * the schema's and tested there; what is only true here is which rows it is
 * run over — a draft and a published revision, both, and a deleted page's
 * neither.
 */

function document(props: Record<string, PropValue> = {}): CheckoutSchema {
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
        children: ["image"],
        props: {},
        styles: {},
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false },
      },
      image: {
        id: "image",
        type: "core.image",
        parentId: "root",
        children: [],
        props,
        styles: {},
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false },
      },
    },
  }
}

const stored = (schema: CheckoutSchema): object => JSON.parse(serialize(schema)) as object

let tenant: TenantContext & { userId: string }
let projectId: string
let assetId: string
let counter = 0

/** A page, with the document its draft holds. */
async function aPage(title: string, draft: CheckoutSchema): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId,
      title,
      slug: `${title.toLowerCase().replace(/\W+/g, "-")}-${String(counter)}`,
      draftSchema: stored(draft),
    },
  })

  return page.id
}

/** Publishes a page, with a revision holding a document of its own. */
async function publish(pageId: string, published: CheckoutSchema): Promise<void> {
  const revision = await prisma.revision.create({
    data: {
      pageId,
      number: 1,
      kind: "publish",
      schema: stored(published),
      theme: {},
      schemaVersion: "1.0.0",
      rendererVersion: "0.1.0",
      createdBy: tenant.userId,
    },
  })

  await prisma.page.update({ where: { id: pageId }, data: { publishedRevisionId: revision.id } })
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.asset.deleteMany({})
  await prisma.revision.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `delete-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })

  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  projectId = project.id
  tenant = { userId: user.id, projectId }

  const asset = await prisma.asset.create({
    data: {
      projectId,
      fileName: "hero.png",
      mimeType: "image/png",
      sizeBytes: 1_000,
      storageKey: `assets/${suffix}.png`,
      url: `https://cdn.test/assets/${suffix}.png`,
      sha256: suffix.padEnd(64, "0").slice(0, 64),
    },
  })

  assetId = asset.id
})

describe("an asset nothing points at", () => {
  it("is deleted", async () => {
    await aPage("Checkout", document({ alt: "" }))

    expect(await deleteAsset(tenant, assetId)).toEqual({ ok: true })
  })

  it("leaves the row behind, dated", async () => {
    /*
     * Soft on purpose. The usage check reads documents and can be wrong in
     * one direction; a row with a date on it can be put back, and a file
     * removed from storage cannot.
     */
    await deleteAsset(tenant, assetId)

    const row = await prisma.asset.findUnique({ where: { id: assetId } })

    expect(row?.deletedAt).toBeInstanceOf(Date)
  })

  it("is gone from the library", async () => {
    await deleteAsset(tenant, assetId)

    expect(await assetRepository.list(tenant)).toEqual([])
  })

  it("is not deleted twice", async () => {
    await deleteAsset(tenant, assetId)

    expect(await deleteAsset(tenant, assetId)).toEqual({ ok: false, reason: "not-found" })
  })
})

describe("an asset a page still points at", () => {
  it("is refused, and the page is named", async () => {
    await aPage("Checkout", document({ src: { $asset: assetId } }))

    expect(await deleteAsset(tenant, assetId)).toEqual({
      ok: false,
      reason: "in-use",
      places: ["Checkout"],
    })
  })

  it("names every page that uses it", async () => {
    await aPage("Checkout", document({ src: { $asset: assetId } }))
    await aPage("Thank you", document({ src: { $asset: assetId } }))

    const result = await deleteAsset(tenant, assetId)

    if (result.ok || result.reason !== "in-use") {
      throw new Error("Expected a refusal that names the pages.")
    }

    expect([...result.places].sort()).toEqual(["Checkout", "Thank you"])
  })

  it("leaves the row untouched", async () => {
    await aPage("Checkout", document({ src: { $asset: assetId } }))
    await deleteAsset(tenant, assetId)

    const row = await prisma.asset.findUnique({ where: { id: assetId } })

    expect(row?.deletedAt).toBeNull()
  })

  it("finds it in the page settings as well as the nodes", async () => {
    // The two references easiest to forget, and the walk names them rather
    // than discovering them.
    const page = { ...document({ alt: "" }), settings: { favicon: { $asset: assetId } } }

    await aPage("Checkout", page)

    expect(await deleteAsset(tenant, assetId)).toMatchObject({ reason: "in-use" })
  })
})

describe("an asset only the published version points at", () => {
  it("is refused, and said to be published", async () => {
    /*
     * The merchant has already taken the picture off that page as far as they
     * are concerned — their draft no longer names it. "Still used on
     * Checkout" would read as a bug; the marker says the edit is waiting to
     * go live.
     */
    const page = await aPage("Checkout", document({ alt: "" }))

    await publish(page, document({ src: { $asset: assetId } }))

    expect(await deleteAsset(tenant, assetId)).toEqual({
      ok: false,
      reason: "in-use",
      places: ["Checkout (published)"],
    })
  })

  it("names the page once when the draft points at it too", async () => {
    const page = await aPage("Checkout", document({ src: { $asset: assetId } }))

    await publish(page, document({ src: { $asset: assetId } }))

    expect(await deleteAsset(tenant, assetId)).toEqual({
      ok: false,
      reason: "in-use",
      places: ["Checkout"],
    })
  })
})

describe("what does not count as using it", () => {
  it("a deleted page", async () => {
    // Nothing restores one, so a reference held only by a deleted page is a
    // reference nothing can ever render.
    const page = await aPage("Old", document({ src: { $asset: assetId } }))

    await prisma.page.update({ where: { id: page }, data: { deletedAt: new Date() } })

    expect(await deleteAsset(tenant, assetId)).toEqual({ ok: true })
  })

  it("a page in somebody else's project", async () => {
    const other = await prisma.user.create({
      data: {
        email: `other-${String(Date.now())}@example.test`,
        passwordHash: "fixture:no-password",
        emailVerifiedAt: new Date(),
      },
    })
    const elsewhere = await prisma.project.create({
      data: { userId: other.id, name: "Theirs", slug: `theirs-${String(Date.now())}` },
    })

    await prisma.page.create({
      data: {
        projectId: elsewhere.id,
        title: "Theirs",
        slug: "theirs",
        draftSchema: stored(document({ src: { $asset: assetId } })),
      },
    })

    expect(await deleteAsset(tenant, assetId)).toEqual({ ok: true })
  })
})

describe("an asset that is not this tenant's", () => {
  it("answers as though it never existed", async () => {
    // Which of the two it was is a fact about somebody else's project.
    const stranger = { userId: "usr_nobody", projectId }

    expect(await deleteAsset(stranger, assetId)).toEqual({ ok: false, reason: "not-found" })
  })

  it("is left alone", async () => {
    await deleteAsset({ userId: "usr_nobody", projectId }, assetId)

    const row = await prisma.asset.findUnique({ where: { id: assetId } })

    expect(row?.deletedAt).toBeNull()
  })
})

describe("a document that cannot be read", () => {
  it("refuses to answer rather than guessing nothing uses it", async () => {
    /*
     * A draft is validated before it is stored, so this should not happen.
     * If it has, the honest answer is that we do not know — and guessing "no"
     * is how a live page loses a picture.
     */
    await prisma.page.create({
      data: {
        projectId,
        title: "Broken",
        slug: `broken-${String(Date.now())}`,
        draftSchema: { nodes: "not a document" },
      },
    })

    await expect(deleteAsset(tenant, assetId)).rejects.toBeInstanceOf(UnreadableDocumentError)
  })
})
