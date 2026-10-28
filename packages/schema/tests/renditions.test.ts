import { describe, expect, it } from "vitest"

import {
  RENDITION_FORMATS,
  RENDITION_MIME_TYPES,
  RENDITION_SIZES,
  RENDITION_WIDTHS,
  assetRendition,
  assetRenditions,
} from "../src"

/**
 * The sizes and formats an image is served at.
 *
 * A contract between three sides: the service that writes the files, the row
 * that records which exist, and the renderer that writes a `srcset`. These
 * pin the vocabulary, and the strictness that keeps a JSON column from
 * carrying something nobody meant to put there.
 */

const THUMBNAIL = {
  size: "thumbnail",
  format: "webp",
  width: 320,
  height: 213,
  sizeBytes: 4_100,
} as const

describe("the vocabulary", () => {
  it("is the widths a published page asks for by name", () => {
    expect(RENDITION_WIDTHS).toEqual({ thumbnail: 320, medium: 960, large: 1920 })
  })

  it("is narrowest first, which is the order a srcset wants", () => {
    const widths = RENDITION_SIZES.map((size) => RENDITION_WIDTHS[size])

    expect(widths).toEqual([...widths].sort((a, b) => a - b))
  })

  it("has a width for every size and a type for every format", () => {
    for (const size of RENDITION_SIZES) {
      expect(RENDITION_WIDTHS[size]).toBeGreaterThan(0)
    }

    for (const format of RENDITION_FORMATS) {
      expect(RENDITION_MIME_TYPES[format]).toBe(`image/${format}`)
    }
  })
})

describe("one recorded rendition", () => {
  it("is accepted when it says what it is and how big", () => {
    expect(assetRendition.safeParse(THUMBNAIL).success).toBe(true)
  })

  it("is refused for a size or a format nothing produces", () => {
    expect(assetRendition.safeParse({ ...THUMBNAIL, size: "huge" }).success).toBe(false)
    expect(assetRendition.safeParse({ ...THUMBNAIL, format: "jpeg" }).success).toBe(false)
  })

  it("is refused for a dimension no file has", () => {
    for (const key of ["width", "height", "sizeBytes"] as const) {
      expect(assetRendition.safeParse({ ...THUMBNAIL, [key]: 0 }).success).toBe(false)
      expect(assetRendition.safeParse({ ...THUMBNAIL, [key]: -1 }).success).toBe(false)
      expect(assetRendition.safeParse({ ...THUMBNAIL, [key]: 1.5 }).success).toBe(false)
    }
  })

  it("is refused when a dimension is missing", () => {
    const { height: _height, ...rest } = THUMBNAIL

    expect(assetRendition.safeParse(rest).success).toBe(false)
  })

  it("is refused for carrying a key, which is derived and never stored", () => {
    /*
     * The one extra field worth naming. A rendition's storage key is a
     * function of its asset's content hash and these two names, so a key
     * recorded here would be a second copy of a path — free to drift from
     * where the bytes actually are.
     */
    expect(
      assetRendition.safeParse({ ...THUMBNAIL, storageKey: "assets/elsewhere.webp" }).success,
    ).toBe(false)
  })
})

describe("an asset's whole set", () => {
  it("may be empty, which is what a small logo has", () => {
    expect(assetRenditions.parse([])).toEqual([])
  })

  it("is every size in every format at most", () => {
    const all = RENDITION_SIZES.flatMap((size) =>
      RENDITION_FORMATS.map((format) => ({
        size,
        format,
        width: RENDITION_WIDTHS[size],
        height: Math.round(RENDITION_WIDTHS[size] / 1.5),
        sizeBytes: 1_000,
      })),
    )

    expect(assetRenditions.parse(all)).toHaveLength(6)
  })

  it("is refused whole when one of them is wrong", () => {
    expect(assetRenditions.safeParse([THUMBNAIL, { ...THUMBNAIL, width: 0 }]).success).toBe(false)
  })
})
