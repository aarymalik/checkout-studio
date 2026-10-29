import type { LibraryAsset } from "@checkout-studio/api"
import { describe, expect, it } from "vitest"

import { EVERYTHING, SORTS, SORT_LABELS, kindCounts, selectAssets } from "./select"

/**
 * Finding one asset among a thousand.
 *
 * Separate from the panel, so what happens at a thousand can be checked
 * without rendering a thousand of anything.
 */

function asset(over: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    id: "ast_one",
    fileName: "hero.png",
    mimeType: "image/png",
    kind: "image",
    sizeBytes: 10_000,
    width: 1200,
    height: 800,
    url: "https://cdn.test/assets/one.png",
    thumbnailUrl: "https://cdn.test/assets/one/thumbnail-320.webp",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...over,
  }
}

const LIBRARY: readonly LibraryAsset[] = [
  asset({
    id: "a",
    fileName: "hero-banner.png",
    sizeBytes: 90_000,
    createdAt: "2026-10-03T00:00:00.000Z",
  }),
  asset({
    id: "b",
    fileName: "Logo.svg",
    mimeType: "image/svg+xml",
    kind: "vector",
    sizeBytes: 2_000,
    createdAt: "2026-10-01T00:00:00.000Z",
  }),
  asset({
    id: "c",
    fileName: "promo.mp4",
    mimeType: "video/mp4",
    kind: "video",
    sizeBytes: 400_000,
    createdAt: "2026-10-02T00:00:00.000Z",
  }),
  asset({
    id: "d",
    fileName: "brand.woff2",
    mimeType: "font/woff2",
    kind: "font",
    sizeBytes: 30_000,
    createdAt: "2026-10-04T00:00:00.000Z",
  }),
]

function ids(assets: readonly LibraryAsset[]): string[] {
  return assets.map((one) => one.id)
}

describe("with nothing asked for", () => {
  it("is everything, newest first", () => {
    expect(ids(selectAssets(LIBRARY, EVERYTHING))).toEqual(["d", "a", "c", "b"])
  })

  it("leaves the library it was given alone", () => {
    // `sort` mutates, and the array here belongs to the caller's props.
    const before = ids(LIBRARY)

    selectAssets(LIBRARY, { ...EVERYTHING, sort: "name" })

    expect(ids(LIBRARY)).toEqual(before)
  })
})

describe("searching", () => {
  it("matches part of a filename", () => {
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, text: "banner" }))).toEqual(["a"])
  })

  it("ignores case, on both sides", () => {
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, text: "LOGO" }))).toEqual(["b"])
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, text: "logo" }))).toEqual(["b"])
  })

  it("ignores the spaces around what was typed", () => {
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, text: "  promo  " }))).toEqual(["c"])
  })

  it("is everything again when the box is emptied", () => {
    expect(selectAssets(LIBRARY, { ...EVERYTHING, text: "   " })).toHaveLength(4)
  })

  it("matches a run of characters and not a scattering of them", () => {
    /*
     * Substring and not fuzzy, deliberately. A palette is launched; a file list
     * is scanned, and `hb` finding `hero-banner.png` would also find half of
     * anything else.
     */
    expect(selectAssets(LIBRARY, { ...EVERYTHING, text: "hb" })).toEqual([])
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, text: "o-ban" }))).toEqual(["a"])
  })

  it("finds nothing rather than everything when nothing matches", () => {
    expect(selectAssets(LIBRARY, { ...EVERYTHING, text: "nowhere" })).toEqual([])
  })
})

describe("filtering by kind", () => {
  it("shows one group", () => {
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, kind: "vector" }))).toEqual(["b"])
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, kind: "font" }))).toEqual(["d"])
  })

  it("narrows alongside the search rather than instead of it", () => {
    const both = selectAssets(LIBRARY, { ...EVERYTHING, kind: "image", text: "logo" })

    expect(both).toEqual([])
  })

  it("leaves out a row whose type this release no longer permits", () => {
    const old = [...LIBRARY, asset({ id: "e", mimeType: "image/tiff", kind: null })]

    expect(ids(selectAssets(old, { ...EVERYTHING, kind: "image" }))).toEqual(["a"])
  })

  it("still shows that row under everything", () => {
    // Filed under nothing is not the same as hidden. It is a file somebody
    // uploaded and can still copy the URL of.
    const old = [...LIBRARY, asset({ id: "e", mimeType: "image/tiff", kind: null })]

    expect(ids(selectAssets(old, EVERYTHING))).toContain("e")
  })
})

describe("sorting", () => {
  it("has a label for every order it offers", () => {
    for (const sort of SORTS) {
      expect(SORT_LABELS[sort]).toMatch(/^[A-Z]/)
    }
  })

  it("puts the newest or the oldest first", () => {
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, sort: "newest" }))).toEqual([
      "d",
      "a",
      "c",
      "b",
    ])
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, sort: "oldest" }))).toEqual([
      "b",
      "c",
      "a",
      "d",
    ])
  })

  it("orders by name without caring about capitals", () => {
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, sort: "name" }))).toEqual([
      "d",
      "a",
      "b",
      "c",
    ])
  })

  it("counts the numbers in a name as numbers", () => {
    /*
     * Which is the order somebody who named ten files this way is expecting.
     * Compared as text, `picture-10` sorts before `picture-2`.
     */
    const numbered = [
      asset({ id: "ten", fileName: "picture-10.png" }),
      asset({ id: "two", fileName: "picture-2.png" }),
      asset({ id: "one", fileName: "picture-1.png" }),
    ]

    expect(ids(selectAssets(numbered, { ...EVERYTHING, sort: "name" }))).toEqual([
      "one",
      "two",
      "ten",
    ])
  })

  it("treats a capital letter as no difference at all", () => {
    /*
     * Two names differing only in case are a tie, so they keep the order they
     * came in — newest first. Letting the collation decide would put
     * `apple.png` before `Apple.png` for a reason the merchant cannot see.
     */
    const cased = [
      asset({ id: "upper", fileName: "Apple.png" }),
      asset({ id: "lower", fileName: "apple.png" }),
    ]

    expect(ids(selectAssets(cased, { ...EVERYTHING, sort: "name" }))).toEqual(["upper", "lower"])
    expect(ids(selectAssets([...cased].reverse(), { ...EVERYTHING, sort: "name" }))).toEqual([
      "lower",
      "upper",
    ])
  })

  it("puts the largest first", () => {
    expect(ids(selectAssets(LIBRARY, { ...EVERYTHING, sort: "largest" }))).toEqual([
      "c",
      "a",
      "d",
      "b",
    ])
  })

  it("keeps the server's order for a tie, rather than shuffling it", () => {
    // Two files uploaded in the same second must not swap places between
    // renders, which is what an unstable sort would do.
    const sameMoment = [
      asset({ id: "first", createdAt: "2026-10-01T00:00:00.000Z", sizeBytes: 500 }),
      asset({ id: "second", createdAt: "2026-10-01T00:00:00.000Z", sizeBytes: 500 }),
      asset({ id: "third", createdAt: "2026-10-01T00:00:00.000Z", sizeBytes: 500 }),
    ]

    for (const sort of SORTS) {
      expect(ids(selectAssets(sameMoment, { ...EVERYTHING, sort }))).toEqual([
        "first",
        "second",
        "third",
      ])
    }
  })
})

describe("how many of each kind there are", () => {
  it("counts the groups that exist", () => {
    expect([...kindCounts(LIBRARY)]).toEqual([
      ["image", 1],
      ["vector", 1],
      ["video", 1],
      ["font", 1],
    ])
  })

  it("offers nothing for a group with nothing in it", () => {
    // A library of logos should not offer to show the videos in it.
    expect(kindCounts([asset()]).has("video")).toBe(false)
  })

  it("counts nothing for a type this release no longer permits", () => {
    expect([...kindCounts([asset({ kind: null })])]).toEqual([])
  })

  it("is empty for an empty library", () => {
    expect(kindCounts([]).size).toBe(0)
  })
})
