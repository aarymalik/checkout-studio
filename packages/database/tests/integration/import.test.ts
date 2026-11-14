import { beforeEach, describe, expect, it } from "vitest"

import { importRepository, TenantScopeError } from "../../src"
import type { ImportCommit, TenantContext } from "../../src"
import { createTenant, prisma, truncateAll } from "../helpers"

/**
 * Writing an imported page, all of it or none of it.
 *
 * Against a real database, because every claim here is about a transaction:
 * what survives a rollback, what an index refuses, and what a unique
 * constraint quietly resolves to instead of failing.
 */

let tenant: TenantContext & { userId: string }
let projectId: string
let counter = 0

function anAsset(sha: string, over: Partial<ImportCommit["assets"][number]> = {}) {
  return {
    sourceId: `ast_source_${sha}`,
    fileName: `${sha}.png`,
    mimeType: "image/png",
    sizeBytes: 2_048,
    width: 800,
    height: 600,
    storageKey: `assets/${sha}.png`,
    url: `https://cdn.test/assets/${sha}.png`,
    sha256: sha.padEnd(64, "0"),
    ...over,
  }
}

function commit(over: Partial<ImportCommit> = {}): ImportCommit {
  counter += 1

  return {
    assets: [],
    page: { title: "Checkout", slug: `checkout-${String(counter)}` },
    document: () => ({ version: "1.0.0" }),
    theme: null,
    ...over,
  }
}

beforeEach(async () => {
  await truncateAll()

  const owner = await createTenant()
  const project = await prisma.project.create({
    data: {
      userId: owner.userId,
      name: "Test",
      slug: `test-${String(Date.now())}-${String(counter)}`,
    },
  })

  projectId = project.id
  tenant = { ...owner, projectId }
})

describe("a commit that goes through", () => {
  it("writes the page and the assets together", async () => {
    const result = await importRepository.commit(
      tenant,
      commit({ assets: [anAsset("aaa"), anAsset("bbb")] }),
    )

    expect(result.ok).toBe(true)
    expect(await prisma.page.count()).toBe(1)
    expect(await prisma.asset.count()).toBe(2)
  })

  it("hands back the id each asset ended up with", async () => {
    const result = await importRepository.commit(tenant, commit({ assets: [anAsset("aaa")] }))

    if (!result.ok) throw new Error("Expected it to commit.")

    const row = await prisma.asset.findFirstOrThrow({ select: { id: true } })

    expect(result.assets.get("ast_source_aaa")).toBe(row.id)
  })

  it("gives the document the ids before it stores it", async () => {
    /*
     * The ids cannot be known in advance — `(projectId, sha256)` is unique,
     * so bytes this project already holds resolve to the row holding them.
     * The document is produced from what the transaction actually got.
     */
    let seen: ReadonlyMap<string, string> | null = null

    const result = await importRepository.commit(
      tenant,
      commit({
        assets: [anAsset("aaa")],
        document: (assets) => {
          seen = assets

          return { version: "1.0.0", asset: assets.get("ast_source_aaa") }
        },
      }),
    )

    if (!result.ok) throw new Error("Expected it to commit.")

    const page = await prisma.page.findFirstOrThrow({ select: { draftSchema: true } })

    expect(seen).not.toBeNull()
    expect(page.draftSchema).toMatchObject({ asset: result.assets.get("ast_source_aaa") })
  })
})

describe("bytes the project already holds", () => {
  it("resolve to the row that holds them rather than a second copy", async () => {
    await importRepository.commit(tenant, commit({ assets: [anAsset("aaa")] }))
    const second = await importRepository.commit(tenant, commit({ assets: [anAsset("aaa")] }))

    expect(await prisma.asset.count()).toBe(1)
    expect(second.ok ? second.assets.get("ast_source_aaa") : null).not.toBeNull()
  })

  it("come back when they had been deleted", async () => {
    // A picture deleted last week returns rather than colliding with the
    // constraint that remembers it.
    await importRepository.commit(tenant, commit({ assets: [anAsset("aaa")] }))
    await prisma.asset.updateMany({ data: { deletedAt: new Date() } })

    await importRepository.commit(tenant, commit({ assets: [anAsset("aaa")] }))

    expect(await prisma.asset.count({ where: { deletedAt: null } })).toBe(1)
  })

  it("keep the name they were first given", async () => {
    // Renaming the row would rename it everywhere it is already used.
    await importRepository.commit(tenant, commit({ assets: [anAsset("aaa")] }))
    await importRepository.commit(
      tenant,
      commit({ assets: [anAsset("aaa", { fileName: "renamed.png" })] }),
    )

    expect((await prisma.asset.findFirstOrThrow()).fileName).toBe("aaa.png")
  })
})

describe("a commit that fails", () => {
  it("leaves no asset behind when the document is refused", async () => {
    /*
     * The whole point of the transaction. A page whose assets landed but
     * whose document did not is worse than a plain failure: nobody knows it
     * happened, and the rows that did land are unreachable.
     */
    const result = await importRepository.commit(
      tenant,
      commit({ assets: [anAsset("aaa"), anAsset("bbb")], document: () => null }),
    )

    expect(result).toEqual({ ok: false, reason: "document-rejected" })
    expect(await prisma.asset.count()).toBe(0)
    expect(await prisma.page.count()).toBe(0)
  })

  it("leaves no asset behind when the address is taken", async () => {
    const first = commit({ assets: [anAsset("aaa")] })

    await importRepository.commit(tenant, first)

    const result = await importRepository.commit(tenant, {
      ...commit({ assets: [anAsset("bbb")] }),
      page: first.page,
    })

    expect(result).toEqual({ ok: false, reason: "slug-taken" })
    expect(await prisma.asset.count()).toBe(1)
    expect(await prisma.page.count()).toBe(1)
  })

  it("lets an unexpected failure through rather than naming it", async () => {
    /*
     * Only the two failures this knows about are reported as failures. A
     * database that has gone away, or a bug in the caller's own code, must
     * not come back as "slug-taken" — an answer somebody would act on by
     * renaming a page that was never the problem.
     */
    await expect(
      importRepository.commit(
        tenant,
        commit({
          document: () => {
            throw new Error("the caller itself broke")
          },
        }),
      ),
    ).rejects.toThrow("the caller itself broke")

    expect(await prisma.page.count()).toBe(0)
  })

  it("refuses to write into a project that is not the caller's", async () => {
    // Invisible is not the same as absent: a read scoped on the owner
    // returns an empty project, which is the wrong premise for a write.
    await expect(
      importRepository.commit({ userId: "usr_nobody", projectId }, commit()),
    ).rejects.toBeInstanceOf(TenantScopeError)

    expect(await prisma.page.count()).toBe(0)
  })
})

describe("the theme", () => {
  it("is left alone when the import does not bring one", async () => {
    const result = await importRepository.commit(tenant, commit({ theme: null }))

    expect(result.ok ? result.themeId : "unset").toBeNull()
    expect(await prisma.theme.count()).toBe(0)
  })

  it("is added beside the project's when it is not a replacement", async () => {
    await prisma.theme.create({ data: { projectId, name: "Ours", tokens: { id: "theme_ours" } } })

    const result = await importRepository.commit(
      tenant,
      commit({ theme: { name: "Spring sale", tokens: { id: "theme_new" }, replace: false } }),
    )

    expect(await prisma.theme.count()).toBe(2)
    expect(result.ok ? result.themeId : null).not.toBeNull()
  })

  it("replaces the row the project already had, keeping its id", async () => {
    /*
     * Every page references the theme by id. Writing a new row would leave
     * the other pages on the old theme and split the project in two.
     */
    const existing = await prisma.theme.create({
      data: { projectId, name: "Ours", tokens: { id: "theme_ours" } },
    })

    const result = await importRepository.commit(
      tenant,
      commit({ theme: { name: "Spring sale", tokens: { id: "theme_new" }, replace: true } }),
    )

    expect(result.ok ? result.themeId : null).toBe(existing.id)
    expect(await prisma.theme.count()).toBe(1)
    expect((await prisma.theme.findFirstOrThrow()).tokens).toEqual({ id: "theme_new" })
  })

  it("creates one when there is nothing to replace", async () => {
    const result = await importRepository.commit(
      tenant,
      commit({ theme: { name: "Spring sale", tokens: { id: "theme_new" }, replace: true } }),
    )

    expect(result.ok ? result.themeId : null).not.toBeNull()
    expect(await prisma.theme.count()).toBe(1)
  })
})
