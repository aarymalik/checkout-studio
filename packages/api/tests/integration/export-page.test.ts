import { beforeEach, describe, expect, it } from "vitest"
import { prisma, type TenantContext } from "@checkout-studio/database"
import { createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema, PropValue } from "@checkout-studio/schema"

import { exportPage } from "../../src/services/portability/export/page"
import type { ExportEnvironment } from "../../src/services/portability/export/page"
import { toJsonBundle } from "../../src/services/portability/export/serialize/json"
import { readJsonBundle } from "../../src/services/portability/import/integrity"

/**
 * Exporting a page, against a real database.
 *
 * The pieces are each proved on their own. What needs a database is the
 * order: that a real stored draft comes out the other end as a file an
 * importer accepts, and that the things only a real project can be in — a
 * page belonging to somebody else, a draft that will not parse, an asset the
 * library has lost — are answered rather than crashed on.
 */

let tenant: TenantContext & { userId: string }
let projectId: string
let counter = 0

const ENVIRONMENT: ExportEnvironment = {
  owners: new Map([
    ["core.page", "core-layout"],
    ["core.text", "core-content"],
  ]),
  installed: new Map([
    ["core-layout", "0.1.0"],
    ["core-content", "0.1.0"],
  ]),
  productVersion: "0.1.0",
  rendererVersion: "^0.1.0",
  author: { name: "Spring Sale Ltd" },
  now: new Date("2026-11-13T09:00:00.000Z"),
}

function aDocument(): CheckoutSchema {
  return createDocument({ projectId, pageId: "pag_placeholder", themeId: "theme_default" })
}

async function aPage(document: unknown, title = "Checkout"): Promise<string> {
  counter += 1

  const row = await prisma.page.create({
    data: {
      projectId,
      title,
      slug: `checkout-${String(counter)}`,
      draftSchema: document as never,
    },
    select: { id: true },
  })

  return row.id
}

async function anAsset(id: string): Promise<string> {
  counter += 1

  const row = await prisma.asset.create({
    data: {
      projectId,
      fileName: "hero.png",
      mimeType: "image/png",
      sizeBytes: 2_048,
      width: 800,
      height: 600,
      storageKey: `assets/${id}-${String(counter)}.png`,
      url: `https://cdn.test/assets/${id}.png`,
      sha256: `${id}-${String(counter)}`.padEnd(64, "0"),
    },
    select: { id: true },
  })

  return row.id
}

/** A page holding one text node, so there is something to walk. */
function withText(props: Record<string, PropValue>): CheckoutSchema {
  const document = aDocument()
  const root = document.nodes[document.root]

  if (root === undefined) throw new Error("The fixture has no root.")

  return {
    ...document,
    nodes: {
      ...document.nodes,
      [document.root]: { ...root, children: ["copy"] },
      copy: {
        id: "copy",
        type: "core.text",
        parentId: document.root,
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

beforeEach(async () => {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}`

  await prisma.asset.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  const user = await prisma.user.create({
    data: {
      email: `export-${suffix}@example.test`,
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

describe("a page that exports", () => {
  it("comes out as a file an importer accepts", async () => {
    // The whole point, end to end: what this writes, the first import gate
    // reads back without complaint.
    const pageId = await aPage(withText({ text: "Pay securely." }))
    const result = await exportPage(tenant, pageId, ENVIRONMENT)

    expect(result.ok).toBe(true)

    if (!result.ok) return

    const read = readJsonBundle(toJsonBundle(result.bundle))

    expect(read.ok).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it("describes itself as the page it was", async () => {
    const pageId = await aPage(withText({ text: "Pay securely." }), "Spring checkout")
    const result = await exportPage(tenant, pageId, ENVIRONMENT)

    expect(result.ok ? result.bundle.manifest : null).toMatchObject({
      kind: "page",
      name: "Spring checkout",
      createdAt: "2026-11-13T09:00:00.000Z",
      createdBy: { name: "Spring Sale Ltd" },
      contents: { pages: ["Spring checkout"], totalNodes: 2 },
    })
  })

  it("requires the plugins behind the components it uses", async () => {
    const pageId = await aPage(withText({ text: "Pay securely." }))
    const result = await exportPage(tenant, pageId, ENVIRONMENT)

    expect(result.ok ? result.bundle.manifest.requires.plugins : []).toEqual([
      { id: "core-content", version: "^0.1.0", optional: false },
      { id: "core-layout", version: "^0.1.0", optional: false },
    ])
  })

  it("carries neither the project it came from nor the page it was", async () => {
    /*
     * The one that matters most, and the only place it can be checked against
     * real ids. Everything upstream redacts a fixture; this redacts a row.
     */
    const pageId = await aPage(withText({ text: "Pay securely." }))
    const result = await exportPage(tenant, pageId, ENVIRONMENT)
    const text = result.ok ? toJsonBundle(result.bundle) : ""

    expect(text).not.toContain(projectId)
    expect(text).not.toContain(pageId)
    expect(text).not.toContain(tenant.userId)
  })
})

describe("the assets it carries", () => {
  it("are the ones the page names, with what an importer matches on", async () => {
    const assetId = await anAsset("hero")
    const pageId = await aPage(withText({ src: { $asset: assetId } }))
    const result = await exportPage(tenant, pageId, ENVIRONMENT)
    const registry = result.ok ? result.bundle.payload["assets"] : null

    expect(registry).toMatchObject([
      { sourceId: assetId, fileName: "hero.png", bytes: 2_048, referencedBy: ["copy"] },
    ])
    expect(result.ok ? result.bundle.manifest.contents.assets : 0).toBe(1)
  })

  it("leave out the rest of the library", async () => {
    // The library belongs to the project; the registry belongs to the page.
    await anAsset("unused")
    const pageId = await aPage(withText({ text: "Pay securely." }))
    const result = await exportPage(tenant, pageId, ENVIRONMENT)

    expect(result.ok ? result.bundle.payload["assets"] : null).toEqual([])
  })
})

describe("what it warns about rather than refusing", () => {
  it("a component type no installed plugin provides", async () => {
    /*
     * The page is already like this — a plugin was uninstalled and its nodes
     * stayed. Refusing would leave somebody with no way to get their work out
     * of a damaged project, which is the opposite of what export is for.
     */
    const pageId = await aPage(withText({ text: "Pay securely." }))
    const without = { ...ENVIRONMENT, owners: new Map([["core.page", "core-layout"]]) }
    const result = await exportPage(tenant, pageId, without)

    expect(result.ok).toBe(true)
    expect(result.ok ? result.warnings : []).toContainEqual({
      code: "unsupported-types",
      types: ["core.text"],
    })
  })

  it("an asset the library no longer holds", async () => {
    const pageId = await aPage(withText({ src: { $asset: "ast_gone" } }))
    const result = await exportPage(tenant, pageId, ENVIRONMENT)

    expect(result.ok ? result.warnings : []).toContainEqual({
      code: "missing-assets",
      assetIds: ["ast_gone"],
    })
  })
})

describe("what it refuses", () => {
  it("a page that is not there", async () => {
    expect(await exportPage(tenant, "pag_nobody", ENVIRONMENT)).toEqual({
      ok: false,
      reason: "not-found",
    })
  })

  it("somebody else's page, as though it never existed", async () => {
    const pageId = await aPage(withText({ text: "Pay securely." }))
    const stranger = { userId: "usr_nobody", projectId }

    expect(await exportPage(stranger, pageId, ENVIRONMENT)).toEqual({
      ok: false,
      reason: "not-found",
    })
  })

  it("a draft that is not a document we can read", async () => {
    // Exporting whatever did parse would ship a file whose contents nobody
    // chose.
    const pageId = await aPage({ version: "1.0.0", nodes: "not a map" })

    expect(await exportPage(tenant, pageId, ENVIRONMENT)).toEqual({
      ok: false,
      reason: "unreadable",
    })
  })

  it("a page with a Stripe key written into its copy", async () => {
    /*
     * The exit criterion, against a real row. A page carrying a live key
     * would send the importing installation's payments to the exporter's
     * account, so the export stops and says where it found it.
     */
    const pageId = await aPage(withText({ text: "key sk_live_51Habcdefg" }))
    const result = await exportPage(tenant, pageId, ENVIRONMENT)

    expect(result).toMatchObject({ ok: false, reason: "secret-found" })
    expect(result.ok === false && result.reason === "secret-found" ? result.found : []).toEqual([
      { path: "document.nodes.copy.props.text", kind: "stripe-key" },
    ])
  })
})

describe("a document redaction cannot leave intact", () => {
  /**
   * Where a key-name policy meets a map keyed by user data.
   *
   * `nodes` is keyed by node id, and a node id is any string up to 64
   * characters. A node called `orders` is a key the policy removes, so the
   * node disappears and its parent is left pointing at nothing; a node called
   * `pageId` is one the policy blanks, so the node becomes the string
   * "redacted". Either way what comes out is no longer a page.
   *
   * Generated ids never collide — this needs a document that arrived from
   * somewhere else or was edited by hand. The export refusing is the point:
   * the alternative is a bundle that passes every gate on the way out and is
   * refused by the schema check on the way in, which is the failure the
   * read-back exists to turn into something a person can act on.
   */

  async function pageWithNodeCalled(id: string): Promise<string> {
    const document = aDocument()
    const root = document.nodes[document.root]

    if (root === undefined) throw new Error("The fixture has no root.")

    return aPage({
      ...document,
      nodes: {
        ...document.nodes,
        [document.root]: { ...root, children: [id] },
        [id]: {
          id,
          type: "core.text",
          parentId: document.root,
          children: [],
          props: {},
          styles: {},
          visibility: { hidden: false },
          animations: [],
          metadata: { locked: false },
        },
      },
    })
  }

  it.each(["orders", "pageId"])("refuses rather than shipping it: a node called %s", async (id) => {
    const pageId = await pageWithNodeCalled(id)

    expect(await exportPage(tenant, pageId, ENVIRONMENT)).toEqual({
      ok: false,
      reason: "invalid-after-redaction",
    })
  })

  it("still exports a page whose nodes are named like anything else", async () => {
    // The guard is for a collision, not for every document.
    const pageId = await pageWithNodeCalled("summary")

    expect((await exportPage(tenant, pageId, ENVIRONMENT)).ok).toBe(true)
  })
})

describe("when it was exported", () => {
  it("is the moment of export, unless a caller says otherwise", async () => {
    // The clock is injected so a test can read a manifest. Left out, the
    // manifest still has to carry a real time rather than nothing.
    const pageId = await aPage(withText({ text: "Pay securely." }))
    const before = Date.now()
    const { now, ...withoutClock } = ENVIRONMENT
    const result = await exportPage(tenant, pageId, withoutClock)

    expect(now).toBeDefined()

    const stamped = Date.parse(result.ok ? result.bundle.manifest.createdAt : "")

    expect(stamped).toBeGreaterThanOrEqual(before)
    expect(stamped).toBeLessThanOrEqual(Date.now())
  })
})
