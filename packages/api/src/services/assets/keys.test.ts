import { RENDITION_FORMATS, RENDITION_SIZES, RENDITION_WIDTHS } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { masterKey, renditionKey } from "./keys"

/**
 * Where an asset's files live.
 *
 * Two properties carry the weight. The key is a function of the content, so
 * identical bytes land on themselves and deduplication is true of storage and
 * not only of the database. And no key is ever recorded, so there is nothing
 * to drift from where the bytes actually went.
 */

const HASH = "9f2a4c8e".repeat(8)
const OTHER = "1b7d3e05".repeat(8)

describe("a master's key", () => {
  it("is the hash and the extension the signature matched", () => {
    expect(masterKey(HASH, "png")).toBe(`assets/${HASH}.png`)
  })

  it("is the same for the same content", () => {
    expect(masterKey(HASH, "jpg")).toBe(masterKey(HASH, "jpg"))
  })

  it("is different for different content", () => {
    expect(masterKey(OTHER, "jpg")).not.toBe(masterKey(HASH, "jpg"))
  })

  it("carries nothing a merchant typed", () => {
    /*
     * A filename is a label. `inspectUpload` refuses one that is a path and
     * never rewrites one, and this is why that is enough: no name reaches a
     * key, so a name could not reach a path even if one got through.
     */
    const key = masterKey(HASH, "png")

    expect(key).toBe(`assets/${HASH}.png`)
    expect(key.split("/")).toHaveLength(2)
  })
})

describe("a rendition's key", () => {
  it("sits under its master's hash", () => {
    expect(renditionKey(HASH, "thumbnail", "webp")).toBe(`assets/${HASH}/thumbnail-320.webp`)
    expect(renditionKey(HASH, "medium", "avif")).toBe(`assets/${HASH}/medium-960.avif`)
    expect(renditionKey(HASH, "large", "webp")).toBe(`assets/${HASH}/large-1920.webp`)
  })

  it("names the width as well as the size", () => {
    // So a file found on its own says what it is, and so that changing a width
    // changes the key rather than silently pointing at the old file.
    for (const size of RENDITION_SIZES) {
      for (const format of RENDITION_FORMATS) {
        expect(renditionKey(HASH, size, format)).toContain(`${size}-${RENDITION_WIDTHS[size]}.`)
      }
    }
  })

  it("is distinct for every size and format an asset can have", () => {
    const keys = RENDITION_SIZES.flatMap((size) =>
      RENDITION_FORMATS.map((format) => renditionKey(HASH, size, format)),
    )

    expect(new Set(keys).size).toBe(keys.length)
  })

  it("never collides with the master's", () => {
    // The master is a file, the renditions are a directory of the same name
    // but for the extension. A store that is really a filesystem would refuse
    // one of the two if these were equal.
    expect(keys(HASH)).not.toContain(masterKey(HASH, "webp"))
  })
})

function keys(sha256: string): string[] {
  return RENDITION_SIZES.flatMap((size) =>
    RENDITION_FORMATS.map((format) => renditionKey(sha256, size, format)),
  )
}
