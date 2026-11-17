import { beforeEach, describe, expect, it } from "vitest"
import {
  prisma,
  symbolRepository,
  TenantScopeError,
  type TenantContext,
} from "@checkout-studio/database"
import { SYMBOL_INSTANCE_TYPE, createDocument, defaultTheme } from "@checkout-studio/schema"
import type { CheckoutSchema, PropValue } from "@checkout-studio/schema"
import { contentHash } from "@checkout-studio/utils"

import { recordingStore } from "../../src/services/assets/store"
import { exportPage } from "../../src/services/portability/export/page"
import type { ExportEnvironment } from "../../src/services/portability/export/page"
import { toJsonBundle } from "../../src/services/portability/export/serialize/json"
import { importPage } from "../../src/services/portability/import/page"
import type { ImportEnvironment } from "../../src/services/portability/import/page"
import type { FetchResult } from "../../src/services/portability/import/fetch"
import { checksumOf } from "../../src/services/portability/checksum"
import { readJsonBundle } from "../../src/services/portability/import/integrity"
import type { BundleManifest } from "../../src/services/portability/types"

/** The one id a successful import created, narrowed from a list. */
function only(ids: readonly string[]): string {
  const [id] = ids

  if (id === undefined) throw new Error("Expected something to have been created.")

  return id
}

/** The manifest out of a bundle this test just made. */
function manifestOf(file: string): BundleManifest {
  const read = readJsonBundle(file)

  if (!read.ok) throw new Error("Expected the fixture to be a bundle.")

  return read.bundle.manifest
}

/**
 * A page leaving one project and arriving in another.
 *
 * The round trip is what the whole phase is for, and it is the only test
 * that can catch the two halves disagreeing: an exporter writing a field an
 * importer does not read, a redaction that leaves a document the schema
 * check refuses, an id rewritten in one place and not another. Every stage
 * is proved on its own elsewhere; this proves they are the same pipeline.
 */

/** A one-pixel PNG, so the sanitizer has something real to accept. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

/** Narrowed: an import is always into a project, so the id is never absent. */
type Project = TenantContext & { userId: string; projectId: string }

/** The fetcher without its optional half, which `exactOptionalPropertyTypes` minds. */
type Fetcher = NonNullable<ImportEnvironment["fetch"]>

let source: Project
let target: Project
let counter = 0

const EXPORTING: ExportEnvironment = {
  owners: new Map([
    ["core.page", "core-layout"],
    ["core.text", "core-content"],
    ["core.image", "core-content"],
    [SYMBOL_INSTANCE_TYPE, "core-layout"],
  ]),
  installed: new Map([
    ["core-layout", "0.1.0"],
    ["core-content", "0.1.0"],
  ]),
  productVersion: "0.1.0",
  rendererVersion: "^0.1.0",
  author: { name: "Spring Sale Ltd" },
  now: new Date("2026-11-15T09:00:00.000Z"),
}

function importing(over: Partial<ImportEnvironment> = {}): ImportEnvironment {
  return {
    installation: {
      schemaVersion: "1.0.0",
      rendererVersion: "0.1.0",
      plugins: new Map([
        ["core-layout", "0.1.0"],
        ["core-content", "0.1.0"],
      ]),
    },
    registry: {
      components: new Map(),
      knownTypes: ["core.page", "core.text", "core.image", SYMBOL_INSTANCE_TYPE],
    },
    store: recordingStore(),
    themeStrategy: "keep-target",
    limits: { maxBytes: 1_000_000, timeoutMs: 1_000 },
    now: new Date("2026-11-15T10:00:00.000Z"),
    fetch: (async (): Promise<FetchResult> => ({
      ok: true,
      asset: { bytes: PNG, contentType: "image/png" },
    })) as Fetcher,
    ...over,
  }
}

async function aProject(label: string): Promise<Project> {
  counter += 1
  const suffix = `${String(Date.now())}-${String(counter)}-${label}`

  const user = await prisma.user.create({
    data: {
      email: `${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, name: label, slug: `project-${suffix}` },
  })

  return { userId: user.id, projectId: project.id }
}

function withNodes(projectId: string, props: Record<string, PropValue>): CheckoutSchema {
  const document = createDocument({ projectId, pageId: "pag_x", themeId: "theme_default" })
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

/** Exports a page out of the source project and returns the file. */
async function exported(
  props: Record<string, PropValue> = { text: "Pay securely." },
): Promise<string> {
  counter += 1

  const page = await prisma.page.create({
    data: {
      projectId: source.projectId,
      title: "Checkout",
      slug: `checkout-${String(counter)}`,
      draftSchema: withNodes(source.projectId, props) as never,
    },
    select: { id: true },
  })

  const result = await exportPage(source, page.id, EXPORTING)

  if (!result.ok) throw new Error(`Expected the fixture to export: ${JSON.stringify(result)}`)

  return toJsonBundle(result.bundle)
}

/** Exports a page whose only child places `symbolId`. */
async function exportedPlacing(symbolId: string): Promise<string> {
  counter += 1

  const document = createDocument({
    projectId: source.projectId,
    pageId: "pag_x",
    themeId: "theme_default",
  })
  const root = document.nodes[document.root]

  if (root === undefined) throw new Error("The fixture has no root.")

  const page = await prisma.page.create({
    data: {
      projectId: source.projectId,
      title: "Checkout",
      slug: `checkout-sym-${String(counter)}`,
      draftSchema: {
        ...document,
        nodes: {
          ...document.nodes,
          [document.root]: { ...root, children: ["placed"] },
          placed: {
            id: "placed",
            type: SYMBOL_INSTANCE_TYPE,
            parentId: document.root,
            children: [],
            props: { symbolId },
            styles: {},
            visibility: { hidden: false },
            animations: [],
            metadata: { locked: false },
          },
        },
      } as never,
    },
    select: { id: true },
  })

  const result = await exportPage(source, page.id, EXPORTING)

  if (!result.ok) throw new Error(`Expected the fixture to export: ${JSON.stringify(result)}`)

  return toJsonBundle(result.bundle)
}

beforeEach(async () => {
  await prisma.symbol.deleteMany({})
  await prisma.asset.deleteMany({})
  await prisma.page.deleteMany({})
  await prisma.theme.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.user.deleteMany({})

  source = await aProject("source")
  target = await aProject("target")
})

describe("a page that makes the round trip", () => {
  it("arrives as a page in the other project", async () => {
    const { report } = await importPage(target, await exported(), importing())

    expect(report.success).toBe(true)
    expect(report.created.pageIds).toHaveLength(1)

    const page = await prisma.page.findFirstOrThrow({
      where: { projectId: target.projectId },
      select: { title: true, projectId: true },
    })

    expect(page.title).toBe("Checkout")
    expect(page.projectId).toBe(target.projectId)
  })

  it("is a different page, not the same one twice", async () => {
    /*
     * Every node id is regenerated, so nothing an importer writes can
     * collide with what the project already had — and the source project
     * still has its own page, untouched.
     */
    const { report } = await importPage(target, await exported(), importing())
    const pageId = only(report.created.pageIds)

    const imported = await prisma.page.findFirstOrThrow({ where: { id: pageId } })
    const document = imported.draftSchema as unknown as CheckoutSchema

    expect(Object.keys(document.nodes)).not.toContain("copy")
    expect(await prisma.page.count({ where: { projectId: source.projectId } })).toBe(1)
  })

  it("brings nothing of the project it came from", async () => {
    // The thing redaction is for, proved against real ids at both ends.
    const file = await exported()

    await importPage(target, file, importing())

    expect(file).not.toContain(source.projectId)
    expect(file).not.toContain(source.userId)
  })

  it("adopts the theme of the project it lands in", async () => {
    /*
     * `keep-target` is the default, and the whole point of it: the page
     * looks like it belongs. Its document has to reference the theme this
     * project actually has, not the one named in the bundle — and the two
     * only differ when the target has a brand of its own, which is why this
     * test gives it one.
     */
    await prisma.theme.create({
      data: {
        projectId: target.projectId,
        name: "Our brand",
        tokens: { ...(defaultTheme as unknown as object), id: "theme_ours" },
      },
    })

    const { report } = await importPage(target, await exported(), importing())
    const imported = await prisma.page.findFirstOrThrow({
      where: { id: only(report.created.pageIds) },
    })
    const document = imported.draftSchema as unknown as CheckoutSchema

    expect(document.theme.themeId).toBe("theme_ours")
  })

  it("counts what it did", async () => {
    const { report } = await importPage(target, await exported(), importing())

    expect(report.statistics).toMatchObject({
      nodesImported: 2,
      assetsUploaded: 0,
      assetsReused: 0,
    })
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe("a page that carries a picture", () => {
  it("brings it into the other project's library", async () => {
    const asset = await prisma.asset.create({
      data: {
        projectId: source.projectId,
        fileName: "hero.png",
        mimeType: "image/png",
        sizeBytes: PNG.length,
        storageKey: `assets/${contentHash(PNG)}.png`,
        url: `https://cdn.test/assets/${contentHash(PNG)}.png`,
        sha256: contentHash(PNG),
      },
      select: { id: true },
    })

    const file = await exported({ src: { $asset: asset.id } })
    const store = recordingStore()
    const { report } = await importPage(target, file, importing({ store }))

    expect(report.success).toBe(true)
    expect(report.statistics.assetsUploaded).toBe(1)
    expect(report.created.assetIds).toHaveLength(1)
    expect(store.objects.size).toBe(1)
    expect(await prisma.asset.count({ where: { projectId: target.projectId } })).toBe(1)
  })

  it("points the imported page at the new asset, not the old one", async () => {
    /*
     * The failure this catches is the one nothing else can: an id rewritten
     * in the registry and not in the document would leave a page in this
     * project pointing at a row in somebody else's.
     */
    const asset = await prisma.asset.create({
      data: {
        projectId: source.projectId,
        fileName: "hero.png",
        mimeType: "image/png",
        sizeBytes: PNG.length,
        storageKey: `assets/${contentHash(PNG)}.png`,
        url: `https://cdn.test/assets/${contentHash(PNG)}.png`,
        sha256: contentHash(PNG),
      },
      select: { id: true },
    })

    const { report } = await importPage(
      target,
      await exported({ src: { $asset: asset.id } }),
      importing(),
    )
    const imported = await prisma.page.findFirstOrThrow({
      where: { id: only(report.created.pageIds) },
    })

    expect(JSON.stringify(imported.draftSchema)).not.toContain(asset.id)
    expect(JSON.stringify(imported.draftSchema)).toContain(only(report.created.assetIds))
  })
})

describe("a page that places a symbol", () => {
  it("brings the definition with it", async () => {
    /*
     * "Instances stay as references — expanding them would sever their live
     * link", so the bundle has to carry what they refer to or arrive with
     * holes in it.
     */
    const symbol = await symbolRepository.create(source, {
      name: "Footer",
      rootNodeId: "sym_root",
      nodes: { sym_root: { id: "sym_root", type: "core.section", children: [] } },
    })

    const file = await exportedPlacing(symbol.id)
    const { report } = await importPage(target, file, importing())

    expect(report.success).toBe(true)
    expect(report.created.symbolIds).toHaveLength(1)

    const landed = await prisma.symbol.findFirstOrThrow({
      where: { projectId: target.projectId },
    })

    expect(landed.name).toBe("Footer")
  })

  it("points the imported page at the definition that landed here", async () => {
    /*
     * The failure nothing else catches: an instance still naming the
     * exporting project's symbol id would render a hole, and the row it
     * names belongs to somebody else.
     */
    const symbol = await symbolRepository.create(source, {
      name: "Footer",
      rootNodeId: "sym_root",
      nodes: { sym_root: { id: "sym_root", type: "core.section", children: [] } },
    })

    const { report } = await importPage(target, await exportedPlacing(symbol.id), importing())
    const imported = await prisma.page.findFirstOrThrow({
      where: { id: only(report.created.pageIds) },
    })
    const text = JSON.stringify(imported.draftSchema)

    expect(text).not.toContain(symbol.id)
    expect(text).toContain(only(report.created.symbolIds))
  })

  it("names it in the manifest, by name rather than by id", async () => {
    const symbol = await symbolRepository.create(source, {
      name: "Footer",
      rootNodeId: "sym_root",
      nodes: { sym_root: { id: "sym_root", type: "core.section", children: [] } },
    })
    const read = readJsonBundle(await exportedPlacing(symbol.id))

    expect(read.ok ? read.bundle.manifest.contents.symbols : []).toEqual(["Footer"])
  })
})

describe("what an import refuses, and what it says about it", () => {
  it("a file that is not a bundle", async () => {
    const { report } = await importPage(target, "{}", importing())

    expect(report.success).toBe(false)
    expect(report.failure).toMatchObject({ stage: "integrity", code: "not-a-bundle" })
  })

  it("a bundle somebody edited", async () => {
    const tampered = (await exported()).replace("Pay securely.", "Pay insecurely")
    const { report } = await importPage(target, tampered, importing())

    expect(report.failure).toMatchObject({ stage: "integrity", code: "checksum-mismatch" })
  })

  it("a bundle from a newer schema, naming what to do about it", async () => {
    const older = importing()
    const { report, plan } = await importPage(target, await exported(), {
      ...older,
      installation: { ...older.installation, schemaVersion: "0.9.0" },
    })

    expect(report.failure).toMatchObject({ stage: "compatibility", code: "schema-too-new" })
    expect(report.failure?.message).toContain("Update Checkout Studio")
    // Blocked, and still able to say what it would have done.
    expect(plan?.blockers).toHaveLength(1)
  })

  it("an address the bundle should not be sending us to", async () => {
    const blocked = importing({
      fetch: (async (): Promise<FetchResult> => ({
        ok: false,
        reason: "blocked-address",
        message: "This asset is hosted on a loopback address.",
      })) as Fetcher,
    })

    const asset = await prisma.asset.create({
      data: {
        projectId: source.projectId,
        fileName: "hero.png",
        mimeType: "image/png",
        sizeBytes: PNG.length,
        storageKey: "assets/x.png",
        url: "https://cdn.test/assets/x.png",
        sha256: contentHash(PNG),
      },
      select: { id: true },
    })

    const { report } = await importPage(
      target,
      await exported({ src: { $asset: asset.id } }),
      blocked,
    )

    expect(report.failure).toMatchObject({ stage: "assets", code: "unfetchable" })
    expect(await prisma.page.count({ where: { projectId: target.projectId } })).toBe(0)
  })

  it("a bundle whose payload is not a page", async () => {
    /*
     * A correct envelope around the wrong contents. Integrity cannot catch
     * it — the checksum is of whatever is inside — so the schema stage is
     * the first thing that looks.
     */
    const payload = { page: { name: "Checkout" }, document: {}, assets: [] }
    const file = toJsonBundle({
      manifest: { ...manifestOf(await exported()), checksum: checksumOf(payload) },
      payload,
    })

    const { report } = await importPage(target, file, importing())

    expect(report.failure).toMatchObject({ stage: "schema", code: "not-a-page-bundle" })
  })

  it("a page at an address this project already uses", async () => {
    // The same bundle twice. The first lands; the second has nowhere to go.
    const file = await exported()

    await importPage(target, file, importing())

    const { report } = await importPage(target, file, importing())

    expect(report.failure).toMatchObject({ stage: "commit", code: "slug-taken" })
    expect(report.failure?.message).toContain("already has a page at")
    expect(await prisma.page.count({ where: { projectId: target.projectId } })).toBe(1)
  })

  it("a bundle naming an asset it does not carry", async () => {
    /*
     * A hand-edited file: the document points at a picture the registry
     * never mentions, so nothing can say what that id becomes here.
     * "An unmapped reference is a hard failure, never a silent drop" — and
     * the drop is what would otherwise happen, leaving a page with a
     * reference to a row in somebody else's project.
     */
    const original = readJsonBundle(await exported())

    if (!original.ok) throw new Error("Expected the fixture to be a bundle.")

    const document = original.bundle.payload["document"] as CheckoutSchema
    const payload = {
      ...original.bundle.payload,
      document: {
        ...document,
        nodes: {
          ...document.nodes,
          copy: { ...document.nodes["copy"], props: { src: { $asset: "ast_ghost" } } },
        },
      },
    }

    const file = toJsonBundle({
      manifest: { ...original.bundle.manifest, checksum: checksumOf(payload) },
      payload,
    })

    const { report } = await importPage(target, file, importing())

    expect(report.failure).toMatchObject({ stage: "commit", code: "document-rejected" })
    expect(report.failure?.message).toContain("could not be rewritten")
    expect(await prisma.page.count({ where: { projectId: target.projectId } })).toBe(0)
  })

  it("leaves nothing behind when it refuses", async () => {
    // Nothing partially applied, which is the phase's own exit criterion.
    await importPage(target, "{}", importing())

    expect(await prisma.page.count({ where: { projectId: target.projectId } })).toBe(0)
    expect(await prisma.asset.count({ where: { projectId: target.projectId } })).toBe(0)
  })
})

describe("the report", () => {
  it("records a migration the bundle needed", async () => {
    /*
     * A page written against an older schema still imports, and the report
     * says what was done to it — which is the only place somebody finds out
     * that their page is not quite the page they exported.
     */
    const newer = importing()
    const { report } = await importPage(target, await exported(), {
      ...newer,
      installation: { ...newer.installation, schemaVersion: "1.2.0" },
    })

    expect(report.success).toBe(true)
    expect(report.migrations).toEqual([{ from: "1.0.0", to: "1.2.0" }])
  })

  it("names the theme it created, when it created one", async () => {
    const { report } = await importPage(
      target,
      await exported(),
      importing({ themeStrategy: "namespace" }),
    )

    expect(report.created.themeId).toBeDefined()
    expect(await prisma.theme.count({ where: { projectId: target.projectId } })).toBe(1)
  })

  it("names no theme when it left the project's alone", async () => {
    const { report } = await importPage(target, await exported(), importing())

    expect(report.created.themeId).toBeUndefined()
  })
})

describe("the clock and the fetcher it is given", () => {
  it("has its own when nobody supplies them", async () => {
    // Both are injected for tests. The production defaults are what runs,
    // and a page with no assets needs no fetcher to prove the rest works.
    const { now: _clock, fetch: _fetcher, ...bare } = importing()
    const { report } = await importPage(target, await exported(), bare)

    expect(report.success).toBe(true)
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe("an import with no project to import into", () => {
  it("fails the way every tenant-scoped operation does", async () => {
    /*
     * Not a refusal: a bundle is not what is wrong. Every route that
     * reaches here has resolved a project, so arriving without one is a
     * caller that skipped a step — and it should look like every other
     * such mistake rather than like a bad file.
     */
    await expect(
      importPage({ userId: target.userId }, await exported(), importing()),
    ).rejects.toBeInstanceOf(TenantScopeError)
  })
})
