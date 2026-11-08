import { beforeEach, describe, expect, it } from "vitest"
import { assetRepository, prisma, type TenantContext } from "@checkout-studio/database"

import { fileAsset, foldersOf } from "../../src/services/assets/folders"

/**
 * Filing an asset, against a real database.
 *
 * A folder is the name its assets carry — there is no folder table — so what
 * these are about is the two consequences of that. A folder exists because
 * something is in it, and the names have to be tidied on the way in or the
 * same folder arrives twice under two spellings.
 */

let tenant: TenantContext & { userId: string }
let projectId: string
let counter = 0

async function anAsset(fileName: string): Promise<string> {
  counter += 1

  const row = await prisma.asset.create({
    data: {
      projectId,
      fileName,
      mimeType: "image/png",
      sizeBytes: 1_000,
      storageKey: `assets/${String(counter)}.png`,
      url: `https://cdn.test/assets/${String(counter)}.png`,
      sha256: String(counter).padEnd(64, "0"),
    },
    select: { id: true },
  })

  return row.id
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.asset.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `folders-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  projectId = project.id
  tenant = { userId: user.id, projectId }
})

describe("filing an asset", () => {
  it("puts it in a folder", async () => {
    const id = await anAsset("hero.png")

    expect(await fileAsset(tenant, id, "Spring sale")).toEqual({ ok: true, folder: "Spring sale" })
    expect((await assetRepository.findById(tenant, id))?.folder).toBe("Spring sale")
  })

  it("takes it out again", async () => {
    const id = await anAsset("hero.png")

    await fileAsset(tenant, id, "Spring sale")

    expect(await fileAsset(tenant, id, null)).toEqual({ ok: true, folder: null })
    expect((await assetRepository.findById(tenant, id))?.folder).toBeNull()
  })

  it("moves it from one to another", async () => {
    const id = await anAsset("hero.png")

    await fileAsset(tenant, id, "Spring sale")
    await fileAsset(tenant, id, "Archive")

    expect((await assetRepository.findById(tenant, id))?.folder).toBe("Archive")
  })

  it("answers as though it never existed for somebody else's asset", async () => {
    const id = await anAsset("hero.png")

    expect(await fileAsset({ userId: "usr_nobody", projectId }, id, "Theirs")).toEqual({
      ok: false,
      reason: "not-found",
    })
    expect((await assetRepository.findById(tenant, id))?.folder).toBeNull()
  })
})

describe("the name", () => {
  it("is trimmed", async () => {
    const id = await anAsset("hero.png")

    expect(await fileAsset(tenant, id, "  Spring sale  ")).toEqual({
      ok: true,
      folder: "Spring sale",
    })
  })

  it("has its inner runs of whitespace collapsed", async () => {
    // "Spring  sale" and "Spring sale" are one folder to everybody except a
    // string comparison.
    const id = await anAsset("hero.png")

    expect(await fileAsset(tenant, id, "Spring   sale")).toMatchObject({ folder: "Spring sale" })
  })

  it("takes the spelling the project already uses", async () => {
    /*
     * Two folders called "spring sale" and "Spring Sale" is the kind of thing
     * nobody means to make and everybody then has to tidy. The first spelling
     * wins, because it is the one already on screen.
     */
    const first = await anAsset("one.png")
    const second = await anAsset("two.png")

    await fileAsset(tenant, first, "Spring Sale")
    await fileAsset(tenant, second, "spring sale")

    expect(await foldersOf(tenant)).toEqual(["Spring Sale"])
  })

  it("is refused when it is empty", async () => {
    const id = await anAsset("hero.png")

    expect(await fileAsset(tenant, id, "   ")).toMatchObject({
      ok: false,
      reason: "invalid",
      message: "A folder needs a name.",
    })
  })

  it("is refused when it is too long", async () => {
    const id = await anAsset("hero.png")
    const result = await fileAsset(tenant, id, "x".repeat(61))

    expect(result).toMatchObject({ ok: false, reason: "invalid" })
    expect((await assetRepository.findById(tenant, id))?.folder).toBeNull()
  })

  it.each(["Spring/Banners", "Spring\\Banners"])("is refused when it contains %s", async (name) => {
    /*
     * Not because a slash would break anything — the name is a column and
     * never a path. Because somebody typing it means nesting, and what they
     * would get is a flat folder with a slash in its name.
     */
    const id = await anAsset("hero.png")

    expect(await fileAsset(tenant, id, name)).toMatchObject({
      ok: false,
      reason: "invalid",
      message: "Folders do not nest, so a name cannot contain a slash.",
    })
  })
})

describe("the folders a project has", () => {
  it("is nothing when nothing is filed", async () => {
    await anAsset("hero.png")

    expect(await foldersOf(tenant)).toEqual([])
  })

  it("is the names its assets carry, each once", async () => {
    const first = await anAsset("one.png")
    const second = await anAsset("two.png")
    const third = await anAsset("three.png")

    await fileAsset(tenant, first, "Spring sale")
    await fileAsset(tenant, second, "Spring sale")
    await fileAsset(tenant, third, "Archive")

    expect(await foldersOf(tenant)).toEqual(["Archive", "Spring sale"])
  })

  it("stops listing one the last asset left", async () => {
    // There is nothing to delete and nothing left behind, which is what
    // somebody who emptied a folder meant.
    const id = await anAsset("hero.png")

    await fileAsset(tenant, id, "Spring sale")
    await fileAsset(tenant, id, null)

    expect(await foldersOf(tenant)).toEqual([])
  })

  it("leaves out a deleted asset's folder", async () => {
    const id = await anAsset("hero.png")

    await fileAsset(tenant, id, "Spring sale")
    await assetRepository.softDelete(tenant, id)

    expect(await foldersOf(tenant)).toEqual([])
  })
})
