import { createDocument, defaultTheme } from "@checkout-studio/schema"
import type { PublishedPage } from "@checkout-studio/database"
import { beforeEach, describe, expect, it, vi } from "vitest"

const findByHostAndSlug = vi.fn<(hostname: string, slug: string) => Promise<PublishedPage | null>>()
const previousRevision = vi.fn<(pageId: string, id: string) => Promise<PublishedPage | null>>()

vi.mock("@checkout-studio/database", () => ({
  publishedRepository: {
    findByHostAndSlug: (hostname: string, slug: string) => findByHostAndSlug(hostname, slug),
    previousRevision: (pageId: string, id: string) => previousRevision(pageId, id),
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

beforeEach(() => {
  findByHostAndSlug.mockReset()
  previousRevision.mockReset()
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
