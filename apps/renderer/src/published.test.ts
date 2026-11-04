import type { assetResolver } from "@checkout-studio/api"
import { createDocument, defaultTheme } from "@checkout-studio/schema"
import type { PublishedPage } from "@checkout-studio/database"
import { beforeEach, describe, expect, it, vi } from "vitest"

const findByHostAndSlug = vi.fn<(hostname: string, slug: string) => Promise<PublishedPage | null>>()
const previousRevision = vi.fn<(pageId: string, id: string) => Promise<PublishedPage | null>>()

type AssetRow = Parameters<typeof assetResolver>[0][number]

const findForProject = vi.fn<
  (projectId: string, ids: Iterable<string>) => Promise<readonly AssetRow[]>
>(async () => [])

vi.mock("@checkout-studio/database", () => ({
  publishedRepository: {
    findByHostAndSlug: (hostname: string, slug: string) => findByHostAndSlug(hostname, slug),
    previousRevision: (pageId: string, id: string) => previousRevision(pageId, id),
  },
  assetRepository: {
    findForProject: (projectId: string, ids: Iterable<string>) => findForProject(projectId, ids),
  },
}))

const { resolvePage } = await import("./published")

/**
 * The fallback chain.
 *
 * The published revision, then the last one that rendered, then nothing. It
 * lives in the application because only the application knows what a revision
 * is — and it is tested here with the repository stubbed, because what is being
 * tested is the decision, not the query.
 */

function revision(overrides: Partial<PublishedPage> = {}): PublishedPage {
  const document = createDocument({
    projectId: "prj_1",
    pageId: "pge_1",
    themeId: defaultTheme.id,
  })

  return {
    pageId: "pge_1",
    projectId: "prj_1",
    title: "Checkout",
    schema: document,
    theme: defaultTheme,
    schemaVersion: "1.0.0",
    revisionId: "rev_2",
    revisionNumber: 2,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

const SHA = "9f2a4c8e".repeat(8)

function assetRow(id: string): AssetRow {
  return {
    id,
    fileName: "hero.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 820_000,
    width: 2400,
    height: 1600,
    storageKey: `assets/${SHA}.jpg`,
    url: `http://localhost:9000/checkout-assets/assets/${SHA}.jpg`,
    sha256: SHA,
    renditions: [{ size: "medium", format: "webp", width: 960, height: 640, sizeBytes: 50_000 }],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }
}

/** A revision whose root node references one asset. */
function revisionReferencing(id: string): PublishedPage {
  const base = revision()
  const document = base.schema as { root: string; nodes: Record<string, { props: unknown }> }
  const root = document.nodes[document.root]

  return {
    ...base,
    schema: {
      ...document,
      nodes: { ...document.nodes, [document.root]: { ...root, props: { src: { $asset: id } } } },
    },
  }
}

beforeEach(() => {
  findByHostAndSlug.mockReset()
  previousRevision.mockReset()
  findForProject.mockClear()
  findForProject.mockResolvedValue([])
})

describe("resolving a published page", () => {
  it("serves the published revision when it renders", async () => {
    findByHostAndSlug.mockResolvedValue(revision())

    const page = await resolvePage("shop.example.com", "checkout")

    expect(page?.title).toBe("Checkout")
    expect(page?.revisionId).toBe("rev_2")
    expect(page?.degraded).toBe(false)
    expect(previousRevision).not.toHaveBeenCalled()
  })

  it("serves nothing when nothing is published there", async () => {
    findByHostAndSlug.mockResolvedValue(null)

    expect(await resolvePage("shop.example.com", "checkout")).toBeNull()
  })

  it("falls back to the last revision that rendered", async () => {
    findByHostAndSlug.mockResolvedValue(revision({ schema: { not: "a document" } }))
    previousRevision.mockResolvedValue(revision({ revisionId: "rev_1", revisionNumber: 1 }))

    const page = await resolvePage("shop.example.com", "checkout")

    // A customer gets a working checkout. "Should not happen" is not a plan for
    // somebody's checkout page.
    expect(page?.revisionId).toBe("rev_1")
    expect(page?.degraded).toBe(true)
    expect(previousRevision).toHaveBeenCalledWith("pge_1", "rev_2")
  })

  it("serves nothing when there is no earlier revision either", async () => {
    findByHostAndSlug.mockResolvedValue(revision({ schema: null }))
    previousRevision.mockResolvedValue(null)

    // The route shows a branded page rather than a broken one.
    expect(await resolvePage("shop.example.com", "checkout")).toBeNull()
  })

  it("serves nothing when the earlier revision will not render either", async () => {
    findByHostAndSlug.mockResolvedValue(revision({ schema: null }))
    previousRevision.mockResolvedValue(revision({ revisionId: "rev_1", schema: 42 }))

    expect(await resolvePage("shop.example.com", "checkout")).toBeNull()
  })

  it("renders with the default theme when the snapshot's theme does not parse", async () => {
    findByHostAndSlug.mockResolvedValue(revision({ theme: { id: "theme_x" } }))

    const page = await resolvePage("shop.example.com", "checkout")

    // A theme that will not parse is recoverable in a way a document is not:
    // the page still has its structure, and rendering it plainly beats not at
    // all.
    expect(page?.theme.id).toBe(defaultTheme.id)
    expect(page?.degraded).toBe(false)
  })

  it("passes the hostname through as given", async () => {
    findByHostAndSlug.mockResolvedValue(null)

    await resolvePage("Shop.Example.com", "checkout")

    // Lower-casing is the repository's business, since it is the query that
    // has to match a stored hostname.
    expect(findByHostAndSlug).toHaveBeenCalledWith("Shop.Example.com", "checkout")
  })
})

describe("the assets a published page needs", () => {
  it("asks for only the ones the document names, in its own project", async () => {
    /*
     * A project may hold a thousand assets and a page may use one. Scoped to
     * the revision's project, so a document cannot name a file belonging to
     * another merchant.
     */
    findByHostAndSlug.mockResolvedValue(revisionReferencing("ast_hero"))

    await resolvePage("shop.example.com", "checkout")

    expect(findForProject).toHaveBeenCalledTimes(1)
    const [projectId, ids] = findForProject.mock.calls[0] ?? []
    expect(projectId).toBe("prj_1")
    expect([...(ids ?? [])]).toEqual(["ast_hero"])
  })

  it("resolves a reference to the URLs a browser fetches", async () => {
    /*
     * The whole point. Before this was wired the renderer's `resolveAsset`
     * defaulted to answering nothing, so every asset reference on every
     * published page resolved to nothing and warned.
     */
    findByHostAndSlug.mockResolvedValue(revisionReferencing("ast_hero"))
    findForProject.mockResolvedValue([assetRow("ast_hero")])

    const page = await resolvePage("shop.example.com", "checkout")
    const urls = page?.resolveAsset("ast_hero")

    expect(urls?.src).toContain(`/assets/${SHA}.jpg`)
    expect(urls?.srcSet).toContain("medium-960.webp 960w")
    expect(urls?.sizes).toBe("(max-width: 2400px) 100vw, 2400px")
  })

  it("resolves an asset that is gone to nothing, rather than failing", async () => {
    // Deleted after the page referenced it. The renderer reports
    // `asset-missing` and the checkout still serves.
    findByHostAndSlug.mockResolvedValue(revisionReferencing("ast_gone"))

    const page = await resolvePage("shop.example.com", "checkout")

    expect(page).not.toBeNull()
    expect(page?.resolveAsset("ast_gone")).toBeNull()
  })

  it("asks for nothing when the document references nothing", async () => {
    // Which is most pages, and a query to learn that is a query wasted.
    findByHostAndSlug.mockResolvedValue(revision())

    const page = await resolvePage("shop.example.com", "checkout")

    expect(page?.resolveAsset("ast_any")).toBeNull()
    expect([...(findForProject.mock.calls[0]?.[1] ?? [])]).toEqual([])
  })

  it("loads the fallback revision's own assets, not the failed one's", async () => {
    /*
     * A revision is a snapshot and may name a different set. Loading the
     * broken revision's references would ask for assets the page being served
     * does not use, and miss the ones it does.
     */
    findByHostAndSlug.mockResolvedValue(revision({ schema: { nope: true } }))
    previousRevision.mockResolvedValue(revisionReferencing("ast_older"))

    const page = await resolvePage("shop.example.com", "checkout")

    expect(page?.degraded).toBe(true)
    expect([...(findForProject.mock.calls[0]?.[1] ?? [])]).toEqual(["ast_older"])
  })
})
