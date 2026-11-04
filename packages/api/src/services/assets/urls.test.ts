import type { StoredAsset } from "@checkout-studio/database"
import type { AssetRendition } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { assetResolver, assetUrlMap, assetUrls } from "./urls"

/**
 * An asset reference, turned into the URLs a page fetches.
 *
 * Where the renditions stop being files and start being a `srcset`. What these
 * protect is the thing that makes them worth producing: that a browser can pick
 * among them, and picks something other than the widest every time.
 */

const SHA = "9f2a4c8e".repeat(8)
const BASE = "https://cdn.test"

function rendition(over: Partial<AssetRendition> = {}): AssetRendition {
  return { size: "thumbnail", format: "webp", width: 320, height: 213, sizeBytes: 4_100, ...over }
}

function asset(over: Partial<StoredAsset> = {}): StoredAsset {
  return {
    id: "ast_one",
    fileName: "hero.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 820_000,
    width: 2400,
    height: 1600,
    storageKey: `assets/${SHA}.jpg`,
    url: `${BASE}/assets/${SHA}.jpg`,
    sha256: SHA,
    renditions: [],
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...over,
  }
}

/**
 * Every size and format, in no particular order.
 *
 * Deliberately not sorted. The order renditions are recorded in is the order
 * they were derived, which a later change to the deriving loop could alter —
 * and a `srcset` has to be widest-last whatever order it was handed.
 */
const EVERY_SIZE: readonly AssetRendition[] = [
  rendition({ size: "large", format: "avif", width: 1920 }),
  rendition({ size: "thumbnail", format: "webp", width: 320 }),
  rendition({ size: "medium", format: "avif", width: 960 }),
  rendition({ size: "large", format: "webp", width: 1920 }),
  rendition({ size: "thumbnail", format: "avif", width: 320 }),
  rendition({ size: "medium", format: "webp", width: 960 }),
]

describe("the fallback every browser gets", () => {
  it("is the master, always", () => {
    // What a browser that reads no `srcset` fetches, and what an asset with no
    // renditions is served as.
    expect(assetUrls(asset(), BASE).src).toBe(`${BASE}/assets/${SHA}.jpg`)
    expect(assetUrls(asset({ renditions: EVERY_SIZE }), BASE).src).toBe(`${BASE}/assets/${SHA}.jpg`)
  })

  it("carries the intrinsic size, so the space is reserved before the bytes land", () => {
    const urls = assetUrls(asset(), BASE)

    expect([urls.width, urls.height]).toEqual([2400, 1600])
  })

  it("leaves the size out for a type we never measured", () => {
    const urls = assetUrls(asset({ mimeType: "font/woff2", width: null, height: null }), BASE)

    expect(urls.width).toBeUndefined()
    expect(urls.height).toBeUndefined()
  })
})

describe("the candidates a browser may choose from", () => {
  it("are one format, widest last, each with its width", () => {
    // Widest last whatever order they were recorded in: a browser reads a
    // `srcset` as a list of candidates, and one out of order is one it may
    // pick wrongly.
    const urls = assetUrls(asset({ renditions: EVERY_SIZE }), BASE)

    expect(urls.srcSet).toBe(
      [
        `${BASE}/assets/${SHA}/thumbnail-320.avif 320w`,
        `${BASE}/assets/${SHA}/medium-960.avif 960w`,
        `${BASE}/assets/${SHA}/large-1920.avif 1920w`,
      ].join(", "),
    )
  })

  it("are AVIF where there is any, because it is half the bytes", () => {
    const urls = assetUrls(asset({ renditions: EVERY_SIZE }), BASE)

    expect(urls.srcSet).not.toContain(".webp")
  })

  it("are WebP when that is all there is, which is every animation", () => {
    // An animated master is offered as WebP only: writing one as AVIF silently
    // returns the first frame.
    const animated = [
      rendition({ size: "thumbnail", format: "webp", width: 320 }),
      rendition({ size: "medium", format: "webp", width: 960 }),
    ]

    expect(assetUrls(asset({ renditions: animated }), BASE).srcSet).toContain("medium-960.webp")
  })

  it("never mix formats in one list", () => {
    /*
     * A browser picks from a `srcset` by width, not by what it can decode. Both
     * formats in one list means a browser that supports AVIF taking a wider
     * JPEG over a narrower AVIF — a choice it cannot make on merit. Choosing
     * between formats is `<picture>`'s job.
     */
    const urls = assetUrls(asset({ renditions: EVERY_SIZE }), BASE)
    const formats = new Set(
      (urls.srcSet ?? "").split(", ").map((entry) => entry.split(" ")[0]?.split(".").pop()),
    )

    expect(formats.size).toBe(1)
  })

  it("are absent for an asset that earned none", () => {
    // A logo narrower than a thumbnail, and every font, video and PDF.
    const urls = assetUrls(asset({ renditions: [] }), BASE)

    expect(urls.srcSet).toBeUndefined()
    expect(urls.sizes).toBeUndefined()
  })
})

describe("how wide the browser is told the image will be", () => {
  it("is present whenever there are candidates", () => {
    /*
     * The whole reason the renditions pay off. A `srcset` of width candidates
     * with no `sizes` means `100vw`, so the browser takes the widest every
     * time — the same bytes as before, plus five extra files.
     */
    const urls = assetUrls(asset({ renditions: EVERY_SIZE }), BASE)

    expect(urls.sizes).toBeDefined()
  })

  it("caps at the asset's own width, which is the honest ceiling", () => {
    // Past its intrinsic width an image is being upscaled, so no layout shows
    // it usefully wider. The display width is a style and changes per
    // breakpoint, so it is not something this can know.
    expect(assetUrls(asset({ width: 2400, renditions: EVERY_SIZE }), BASE).sizes).toBe(
      "(max-width: 2400px) 100vw, 2400px",
    )
  })

  it("stops the widest candidate winning for a small asset", () => {
    const small = assetUrls(asset({ width: 600, renditions: EVERY_SIZE }), BASE)

    expect(small.sizes).toBe("(max-width: 600px) 100vw, 600px")
  })

  it("is absent when the width is unknown, rather than guessed", () => {
    const urls = assetUrls(asset({ width: null, renditions: EVERY_SIZE }), BASE)

    expect(urls.sizes).toBeUndefined()
    expect(urls.srcSet).toBeDefined()
  })
})

describe("resolving a reference", () => {
  it("answers for an asset in the set", () => {
    const resolve = assetResolver([asset()], BASE)

    expect(resolve("ast_one")?.src).toBe(`${BASE}/assets/${SHA}.jpg`)
  })

  it("answers nothing for one that is not", () => {
    /*
     * An asset deleted after a page referenced it. The renderer reports
     * `asset-missing` and the page renders without it, which is why resolution
     * does not throw: one missing logo should not take down a checkout.
     */
    expect(assetResolver([asset()], BASE)("ast_gone")).toBeNull()
  })

  it("answers nothing when there is nothing, which is most pages", () => {
    expect(assetResolver([], BASE)("ast_one")).toBeNull()
  })

  it("is the same answer the map gives", () => {
    // The map is what crosses to a client component; the resolver is for the
    // server. Two shapes of one answer, and they have to agree.
    const assets = [asset(), asset({ id: "ast_two", renditions: EVERY_SIZE })]
    const map = assetUrlMap(assets, BASE)
    const resolve = assetResolver(assets, BASE)

    expect(resolve("ast_two")).toEqual(map["ast_two"])
    expect(Object.keys(map)).toEqual(["ast_one", "ast_two"])
  })
})

describe("where the files are fetched from", () => {
  it("is the base it was given, not the one the row was written with", () => {
    // Moving assets behind a CDN is a change of one environment variable, which
    // is why no URL but the master's is stored.
    const urls = assetUrls(asset({ renditions: EVERY_SIZE }), "https://other.test/media")

    expect(urls.srcSet).toContain("https://other.test/media/assets/")
  })

  it("does not double a separator", () => {
    const urls = assetUrls(asset({ renditions: EVERY_SIZE }), `${BASE}/`)

    expect(urls.srcSet).not.toContain("//assets")
  })
})
