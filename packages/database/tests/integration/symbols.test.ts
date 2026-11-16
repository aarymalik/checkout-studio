import { beforeEach, describe, expect, it } from "vitest"

import { symbolRepository, TenantScopeError } from "../../src"
import type { NewSymbol, TenantContext } from "../../src"
import { createTenant, prisma, truncateAll } from "../helpers"

/**
 * Symbol definitions, against a real database.
 *
 * They belong to a project and never to a page, and that is what most of
 * these are about: one copy, reachable only by its owner, whose version
 * moves when what it draws does.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

function aSymbol(over: Partial<NewSymbol> = {}): NewSymbol {
  return {
    name: "Footer",
    rootNodeId: "sym_root",
    nodes: { sym_root: { id: "sym_root", type: "core.section" } },
    ...over,
  }
}

async function aProject(userId: string): Promise<string> {
  counter += 1

  const project = await prisma.project.create({
    data: { userId, name: "Test", slug: `test-${String(Date.now())}-${String(counter)}` },
  })

  return project.id
}

beforeEach(async () => {
  await truncateAll()

  const owner = await createTenant()

  tenant = { ...owner, projectId: await aProject(owner.userId) }
})

describe("creating one", () => {
  it("stores the subtree as it was given", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    expect(created).toMatchObject({
      name: "Footer",
      rootNodeId: "sym_root",
      version: "1.0.0",
    })
    expect(created.nodes).toEqual({ sym_root: { id: "sym_root", type: "core.section" } })
  })

  it("refuses a project that is not the caller's", async () => {
    // Invisible is not the same as absent: a read scoped on the owner sees
    // an empty project, which is the wrong premise for a write.
    const stranger = { userId: "usr_nobody", projectId: tenant.projectId }

    await expect(symbolRepository.create(stranger, aSymbol())).rejects.toBeInstanceOf(
      TenantScopeError,
    )
    expect(await prisma.symbol.count()).toBe(0)
  })
})

describe("the project's symbols", () => {
  it("are listed by name, so a panel reads the same way twice", async () => {
    await symbolRepository.create(tenant, aSymbol({ name: "Footer" }))
    await symbolRepository.create(tenant, aSymbol({ name: "Announcement" }))

    expect((await symbolRepository.list(tenant)).map((symbol) => symbol.name)).toEqual([
      "Announcement",
      "Footer",
    ])
  })

  it("are only this project's", async () => {
    const other = await createTenant()
    const theirs = { ...other, projectId: await aProject(other.userId) }

    await symbolRepository.create(theirs, aSymbol({ name: "Theirs" }))

    expect(await symbolRepository.list(tenant)).toEqual([])
  })

  it("read as nothing for somebody else's project", async () => {
    await symbolRepository.create(tenant, aSymbol())

    expect(
      await symbolRepository.list({ userId: "usr_nobody", projectId: tenant.projectId }),
    ).toEqual([])
  })
})

describe("finding one", () => {
  it("answers with it", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    expect((await symbolRepository.findById(tenant, created.id))?.name).toBe("Footer")
  })

  it("answers as though it never existed for somebody else's", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    expect(await symbolRepository.findById({ userId: "usr_nobody" }, created.id)).toBeNull()
  })
})

describe("editing the subtree", () => {
  it("writes it once, which is what every instance then draws", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())
    const saved = await symbolRepository.saveSubtree(tenant, created.id, {
      rootNodeId: "sym_root",
      nodes: { sym_root: { id: "sym_root", type: "core.section", children: ["sym_new"] } },
    })

    expect(saved?.nodes).toMatchObject({ sym_root: { children: ["sym_new"] } })
    expect(await prisma.symbol.count()).toBe(1)
  })

  it("moves the version on, so a cache knows it is stale", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())
    const saved = await symbolRepository.saveSubtree(tenant, created.id, {
      rootNodeId: "sym_root",
      nodes: {},
    })

    expect(saved?.version).toBe("1.0.1")
  })

  it("keeps moving it on", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    await symbolRepository.saveSubtree(tenant, created.id, { rootNodeId: "a", nodes: {} })
    const third = await symbolRepository.saveSubtree(tenant, created.id, {
      rootNodeId: "a",
      nodes: {},
    })

    expect(third?.version).toBe("1.0.2")
  })

  it("refuses somebody else's", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())
    const result = await symbolRepository.saveSubtree({ userId: "usr_nobody" }, created.id, {
      rootNodeId: "theirs",
      nodes: {},
    })

    expect(result).toBeNull()
    expect((await prisma.symbol.findFirstOrThrow()).rootNodeId).toBe("sym_root")
  })
})

describe("renaming", () => {
  it("changes the name", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    expect((await symbolRepository.rename(tenant, created.id, "Site footer"))?.name).toBe(
      "Site footer",
    )
  })

  it("leaves the version alone, because a name is not something a page draws", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    expect((await symbolRepository.rename(tenant, created.id, "Site footer"))?.version).toBe(
      "1.0.0",
    )
  })

  it("refuses somebody else's", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    expect(await symbolRepository.rename({ userId: "usr_nobody" }, created.id, "Theirs")).toBeNull()
  })
})

describe("deleting", () => {
  it("removes it", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    expect(await symbolRepository.remove(tenant, created.id)).toBe(true)
    expect(await prisma.symbol.count()).toBe(0)
  })

  it("answers false for one that is not there", async () => {
    expect(await symbolRepository.remove(tenant, "sym_nobody")).toBe(false)
  })

  it("answers false for somebody else's, and leaves it", async () => {
    const created = await symbolRepository.create(tenant, aSymbol())

    expect(await symbolRepository.remove({ userId: "usr_nobody" }, created.id)).toBe(false)
    expect(await prisma.symbol.count()).toBe(1)
  })
})
