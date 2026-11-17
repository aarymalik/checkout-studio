import { beforeEach, describe, expect, it } from "vitest"
import { prisma, symbolRepository, type TenantContext } from "@checkout-studio/database"
import { SYMBOL_INSTANCE_TYPE, createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { snapshotSymbols } from "../../src/services/pages/symbols"

/**
 * What a revision has to carry so it still renders as it did.
 *
 * Against a real database, because the failure this prevents is not visible
 * at the moment it happens: a revision is written, somebody edits the
 * footer, and a page published in March starts rendering April's footer.
 * There is no error and nothing to point at.
 */

let tenant: TenantContext & { userId: string; projectId: string }
let counter = 0

function withInstances(projectId: string, symbolIds: readonly string[]): CheckoutSchema {
  const document = createDocument({ projectId, pageId: "pag_x", themeId: "theme_default" })
  const root = document.nodes[document.root]

  if (root === undefined) throw new Error("The fixture has no root.")

  const placed = symbolIds.map((_, index) => `placed${String(index)}`)

  return {
    ...document,
    nodes: {
      ...document.nodes,
      [document.root]: { ...root, children: placed },
      ...Object.fromEntries(
        symbolIds.map((symbolId, index) => [
          placed[index] as string,
          {
            id: placed[index] as string,
            type: SYMBOL_INSTANCE_TYPE,
            parentId: document.root,
            children: [],
            props: { symbolId },
            styles: {},
            visibility: { hidden: false },
            animations: [],
            metadata: { locked: false },
          },
        ]),
      ),
    },
  }
}

async function aSymbol(name: string): Promise<string> {
  const created = await symbolRepository.create(tenant, {
    name,
    rootNodeId: "sym_root",
    nodes: { sym_root: { id: "sym_root", type: "core.section", children: [] } },
  })

  return created.id
}

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.symbol.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `snapshot-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: "Test", slug: `test-${suffix}` },
  })

  tenant = { userId: user.id, projectId: project.id }
})

describe("what a page's revision carries", () => {
  it("is the definition of each symbol it places", async () => {
    const footer = await aSymbol("Footer")
    const snapshot = await snapshotSymbols(tenant, withInstances(tenant.projectId, [footer]))

    expect(Object.keys(snapshot)).toEqual([footer])
    expect(snapshot[footer]).toEqual({
      rootId: "sym_root",
      nodes: { sym_root: { id: "sym_root", type: "core.section", children: [] } },
    })
  })

  it("is nothing for a page that places none", async () => {
    await aSymbol("Footer")
    const plain = createDocument({
      projectId: tenant.projectId,
      pageId: "pag_x",
      themeId: "theme_default",
    })

    expect(await snapshotSymbols(tenant, plain)).toEqual({})
  })

  it("leaves out the ones the page never used", async () => {
    /*
     * A project's whole library would make every revision carry everything,
     * including symbols created after the page was published.
     */
    const footer = await aSymbol("Footer")

    await aSymbol("Announcement")

    const snapshot = await snapshotSymbols(tenant, withInstances(tenant.projectId, [footer]))

    expect(Object.keys(snapshot)).toEqual([footer])
  })

  it("carries each once, however many instances place it", async () => {
    const footer = await aSymbol("Footer")
    const snapshot = await snapshotSymbols(
      tenant,
      withInstances(tenant.projectId, [footer, footer]),
    )

    expect(Object.keys(snapshot)).toEqual([footer])
  })

  it("leaves out one that has since been deleted", async () => {
    /*
     * Writing a placeholder would be inventing a definition nobody wrote.
     * The instance survives in the schema, and the renderer reports it —
     * the same answer it gives for a symbol missing today.
     */
    const footer = await aSymbol("Footer")
    const document = withInstances(tenant.projectId, [footer])

    await symbolRepository.remove(tenant, footer)

    expect(await snapshotSymbols(tenant, document)).toEqual({})
  })

  it("carries nothing from somebody else's project", async () => {
    const footer = await aSymbol("Footer")
    const stranger = { userId: "usr_nobody", projectId: tenant.projectId }

    expect(await snapshotSymbols(stranger, withInstances(tenant.projectId, [footer]))).toEqual({})
  })
})

describe("the snapshot a later edit cannot reach", () => {
  it("is the definition as it was, not as it becomes", async () => {
    // The whole point. A page published in March renders March's footer.
    const footer = await aSymbol("Footer")
    const taken = await snapshotSymbols(tenant, withInstances(tenant.projectId, [footer]))

    await symbolRepository.saveSubtree(tenant, footer, {
      rootNodeId: "sym_root",
      nodes: { sym_root: { id: "sym_root", type: "core.section", children: ["sym_new"] } },
    })

    expect(taken[footer]?.nodes).toEqual({
      sym_root: { id: "sym_root", type: "core.section", children: [] },
    })
  })
})
