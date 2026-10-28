import type { AssetRendition } from "@checkout-studio/schema"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { AssetRenditionsError, assetRepository, TenantScopeError } from "../../src"
import type { NewAsset } from "../../src"
import { createTenant, prisma, truncateAll } from "../helpers"

/**
 * A project's media.
 *
 * What these protect is that an asset is identified by its content. Two
 * uploads of one picture are one row, the row survives being deleted and
 * uploaded again, and neither is reachable from another tenant.
 */

async function project(userId: string): Promise<string> {
  const row = await prisma.project.create({
    data: { userId, name: "Project", slug: `project-${Date.now()}-${Math.random()}` },
  })

  return row.id
}

const THUMBNAIL: AssetRendition = {
  size: "thumbnail",
  format: "webp",
  width: 320,
  height: 213,
  sizeBytes: 4_100,
}

const HASH = "9f2a4c8e".repeat(8)

function upload(overrides: Partial<NewAsset> = {}): NewAsset {
  return {
    fileName: "hero.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 820_000,
    width: 2400,
    height: 1600,
    storageKey: `assets/${HASH}.jpg`,
    url: `https://cdn.example.test/assets/${HASH}.jpg`,
    sha256: HASH,
    renditions: [THUMBNAIL],
    ...overrides,
  }
}

async function scoped() {
  const { userId } = await createTenant()

  return { userId, projectId: await project(userId) }
}

describe("recording an asset", () => {
  beforeEach(truncateAll)

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("stores what was given and says it is new", async () => {
    const tenant = await scoped()

    const { asset, deduplicated } = await assetRepository.create(tenant, upload())

    expect(deduplicated).toBe(false)
    expect(asset).toMatchObject({
      fileName: "hero.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 820_000,
      width: 2400,
      height: 1600,
      sha256: HASH,
      storageKey: `assets/${HASH}.jpg`,
    })
    expect(asset.renditions).toEqual([THUMBNAIL])
  })

  it("leaves the dimensions empty for a type we do not decode", async () => {
    const tenant = await scoped()

    const { asset } = await assetRepository.create(
      tenant,
      upload({ mimeType: "font/woff2", width: null, height: null, renditions: [] }),
    )

    expect([asset.width, asset.height]).toEqual([null, null])
    expect(asset.renditions).toEqual([])
  })

  it("refuses without a project, rather than storing an unowned file", async () => {
    const { userId } = await createTenant()

    await expect(assetRepository.create({ userId }, upload())).rejects.toThrow(
      /projectId is required/,
    )
  })

  it("lets a failure that is not a duplicate be itself", async () => {
    /*
     * The insert is the only path, and a duplicate is recognised by its error
     * code. Treating every failure as a duplicate would send this one to an
     * update of a row that was never written, and the merchant would be told
     * something about a record not found instead of about the size.
     */
    const tenant = await scoped()

    await expect(
      assetRepository.create(tenant, upload({ sizeBytes: 3_000_000_000 })),
    ).rejects.toThrow(/integer|range|out of/i)

    expect(await prisma.asset.count()).toBe(0)
  })

  it("refuses a project belonging to somebody else", async () => {
    /*
     * A foreign key is satisfied by any project that exists. Without the
     * ownership check, a caller holding another tenant's project id would
     * write a row into it — and on a duplicate be handed the row already
     * there.
     */
    const mine = await scoped()
    const theirs = await scoped()

    await expect(
      assetRepository.create({ userId: mine.userId, projectId: theirs.projectId }, upload()),
    ).rejects.toThrow(TenantScopeError)

    expect(await prisma.asset.count()).toBe(0)
  })

  it("refuses a project that has been deleted", async () => {
    const tenant = await scoped()

    await prisma.project.update({
      where: { id: tenant.projectId },
      data: { deletedAt: new Date() },
    })

    await expect(assetRepository.create(tenant, upload())).rejects.toThrow(TenantScopeError)
  })

  it("keeps one tenant's assets out of another's listing", async () => {
    const mine = await scoped()
    const theirs = await scoped()

    await assetRepository.create(mine, upload())

    expect(await assetRepository.list(theirs)).toEqual([])
  })
})

describe("the same bytes twice", () => {
  beforeEach(truncateAll)

  it("is one row, and says so", async () => {
    const tenant = await scoped()

    const first = await assetRepository.create(tenant, upload())
    const again = await assetRepository.create(tenant, upload({ fileName: "hero-copy.jpg" }))

    expect(again.deduplicated).toBe(true)
    expect(again.asset.id).toBe(first.asset.id)
    expect(await prisma.asset.count()).toBe(1)
  })

  it("keeps the name it was first given", async () => {
    /*
     * The second upload is the same picture. Renaming the row would rename it
     * everywhere it is already used, which is not what somebody uploading a
     * file again asked for.
     */
    const tenant = await scoped()

    await assetRepository.create(tenant, upload())
    const again = await assetRepository.create(tenant, upload({ fileName: "hero-copy.jpg" }))

    expect(again.asset.fileName).toBe("hero.jpg")
  })

  it("is two rows in two projects, because a key is scoped to one", async () => {
    const { userId } = await createTenant()
    const one = { userId, projectId: await project(userId) }
    const two = { userId, projectId: await project(userId) }

    await assetRepository.create(one, upload())
    const second = await assetRepository.create(two, upload())

    expect(second.deduplicated).toBe(false)
    expect(await prisma.asset.count()).toBe(2)
  })

  it("is one row when both arrive at once", async () => {
    /*
     * Both miss the lookup, one wins the insert and the other reads what the
     * winner wrote. The unique index is what makes this correct; the lookup
     * only makes it cheap.
     */
    const tenant = await scoped()

    const results = await Promise.all([
      assetRepository.create(tenant, upload()),
      assetRepository.create(tenant, upload()),
      assetRepository.create(tenant, upload()),
    ])

    expect(await prisma.asset.count()).toBe(1)
    expect(new Set(results.map((result) => result.asset.id)).size).toBe(1)
  })
})

describe("something deleted and uploaded again", () => {
  beforeEach(truncateAll)

  it("comes back rather than failing or doubling", async () => {
    const tenant = await scoped()

    const first = await assetRepository.create(tenant, upload())

    await prisma.asset.update({
      where: { id: first.asset.id },
      data: { deletedAt: new Date() },
    })

    expect(await assetRepository.list(tenant)).toEqual([])

    const again = await assetRepository.create(tenant, upload())

    expect(again.asset.id).toBe(first.asset.id)
    expect(again.deduplicated).toBe(true)
    expect(await assetRepository.list(tenant)).toHaveLength(1)
  })
})

describe("finding assets", () => {
  beforeEach(truncateAll)

  it("lists a project's own, newest first", async () => {
    const tenant = await scoped()

    const older = await assetRepository.create(tenant, upload())
    const newer = await assetRepository.create(
      tenant,
      upload({ sha256: "1b7d3e05".repeat(8), fileName: "logo.png" }),
    )

    await prisma.asset.update({
      where: { id: older.asset.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    })

    expect((await assetRepository.list(tenant)).map((asset) => asset.id)).toEqual([
      newer.asset.id,
      older.asset.id,
    ])
  })

  it("leaves out what was deleted", async () => {
    const tenant = await scoped()
    const { asset } = await assetRepository.create(tenant, upload())

    await prisma.asset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } })

    expect(await assetRepository.list(tenant)).toEqual([])
    expect(await assetRepository.findById(tenant, asset.id)).toBeNull()
  })

  it("finds one by id, and not somebody else's", async () => {
    const mine = await scoped()
    const theirs = await scoped()
    const { asset } = await assetRepository.create(mine, upload())

    expect(await assetRepository.findById(mine, asset.id)).toMatchObject({ id: asset.id })
    expect(await assetRepository.findById(theirs, asset.id)).toBeNull()
  })

  it("returns nothing for an id that does not exist", async () => {
    const tenant = await scoped()

    expect(await assetRepository.findById(tenant, "ast_missing")).toBeNull()
  })
})

describe("a renditions column this release cannot read", () => {
  beforeEach(truncateAll)

  it("names the asset rather than reporting it as having none", async () => {
    /*
     * Only our own code writes that column, so this is a release having
     * written a different shape. Reported as none, the asset would be served
     * from its master at full size — a slow page rather than a visible bug.
     */
    const tenant = await scoped()
    const { asset } = await assetRepository.create(tenant, upload())

    await prisma.$executeRaw`UPDATE "Asset" SET "renditions" = '[{"size":"huge"}]'::jsonb WHERE "id" = ${asset.id}`

    await expect(assetRepository.findById(tenant, asset.id)).rejects.toThrow(AssetRenditionsError)
  })

  it("refuses a rendition carrying a key, which is derived and never stored", async () => {
    const tenant = await scoped()
    const { asset } = await assetRepository.create(tenant, upload())

    await prisma.$executeRaw`UPDATE "Asset" SET "renditions" = ${JSON.stringify([
      { ...THUMBNAIL, storageKey: "assets/elsewhere.webp" },
    ])}::jsonb WHERE "id" = ${asset.id}`

    await expect(assetRepository.findById(tenant, asset.id)).rejects.toThrow(AssetRenditionsError)
  })
})
