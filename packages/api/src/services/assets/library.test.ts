import type { StoredAsset } from "@checkout-studio/database"
import type { AssetRendition } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { libraryAsset } from "./library"
import { recordingStore } from "./store"

/**
 * An asset as the media library needs it.
 *
 * The projection is where server knowledge stops: key derivation and the
 * store's configuration stay on this side, and what crosses to the browser has
 * no behaviour and nothing in it that says where a file is kept.
 */

const SHA = "9f2a4c8e".repeat(8)

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
    url: `https://cdn.test/assets/${SHA}.jpg`,
    sha256: SHA,
    renditions: [],
    createdAt: new Date("2026-10-01T09:30:00.000Z"),
    ...over,
  }
}

const store = recordingStore("https://cdn.test")

describe("what crosses to the browser", () => {
  it("is what a grid of thumbnails needs", () => {
    const projected = libraryAsset(asset(), store)

    expect(projected).toEqual({
      id: "ast_one",
      fileName: "hero.jpg",
      mimeType: "image/jpeg",
      kind: "image",
      sizeBytes: 820_000,
      width: 2400,
      height: 1600,
      url: `https://cdn.test/assets/${SHA}.jpg`,
      thumbnailUrl: `https://cdn.test/assets/${SHA}.jpg`,
      createdAt: "2026-10-01T09:30:00.000Z",
    })
  })

  it("says nothing about where the file is kept", () => {
    // A storage key is how we find a file. A browser has a URL, which is how
    // it asks for one, and no reason to know the other.
    const projected: Record<string, unknown> = { ...libraryAsset(asset(), store) }

    expect(projected["storageKey"]).toBeUndefined()
    expect(projected["sha256"]).toBeUndefined()
  })

  it("names the kind the signature table puts the type in", () => {
    // So a filter in the browser cannot disagree with the ceilings on the
    // server about what counts as an image.
    expect(libraryAsset(asset({ mimeType: "image/svg+xml" }), store).kind).toBe("vector")
    expect(libraryAsset(asset({ mimeType: "font/woff2" }), store).kind).toBe("font")
    expect(libraryAsset(asset({ mimeType: "application/pdf" }), store).kind).toBe("document")
  })

  it("leaves the kind empty for a type this release no longer permits", () => {
    // A row from an older release. Shown, and not filed under anything.
    expect(libraryAsset(asset({ mimeType: "image/tiff" }), store).kind).toBeNull()
  })

  it("carries the date as a string, because what crosses is JSON", () => {
    expect(libraryAsset(asset(), store).createdAt).toBe("2026-10-01T09:30:00.000Z")
  })

  it("keeps the dimensions empty for a type we do not decode", () => {
    const projected = libraryAsset(
      asset({ mimeType: "font/woff2", width: null, height: null }),
      store,
    )

    expect([projected.width, projected.height]).toEqual([null, null])
  })
})

describe("which file a cell shows", () => {
  it("is the narrowest rendition the asset has", () => {
    const projected = libraryAsset(
      asset({ renditions: [rendition({ size: "large" }), rendition({ size: "thumbnail" })] }),
      store,
    )

    expect(projected.thumbnailUrl).toBe(`https://cdn.test/assets/${SHA}/thumbnail-320.webp`)
  })

  it("is the narrowest it has, not the narrowest there is", () => {
    // A 1,200-pixel master earns a thumbnail and a medium and no large. A
    // 1,000-pixel one earns only a thumbnail. Neither is a reason to ask for a
    // file that was never written.
    const projected = libraryAsset(asset({ renditions: [rendition({ size: "medium" })] }), store)

    expect(projected.thumbnailUrl).toBe(`https://cdn.test/assets/${SHA}/medium-960.webp`)
  })

  it("names the format that rendition was written in", () => {
    const projected = libraryAsset(asset({ renditions: [rendition({ format: "avif" })] }), store)

    expect(projected.thumbnailUrl).toBe(`https://cdn.test/assets/${SHA}/thumbnail-320.avif`)
  })

  it("is the master when there are no renditions", () => {
    /*
     * Right rather than regrettable: an asset with no renditions is one
     * already small enough to have earned none, so the master *is* the
     * thumbnail.
     */
    const projected = libraryAsset(asset({ renditions: [] }), store)

    expect(projected.thumbnailUrl).toBe(projected.url)
  })

  it("is the master for a file there is no picture of", () => {
    const projected = libraryAsset(asset({ mimeType: "application/pdf", renditions: [] }), store)

    expect(projected.thumbnailUrl).toBe(projected.url)
  })
})
