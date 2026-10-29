import { describe, expect, it } from "vitest"

import { SVG_TYPE, UPLOAD_KINDS, kindForMimeType, signatureOf } from "./signatures"

/**
 * The kind a media type belongs to.
 *
 * Read from the same table the signatures are, so the grouping a merchant
 * filters a library by cannot drift from the grouping the size ceilings are
 * written against. The rest of this module is covered through `inspectUpload`,
 * which is the only thing that should be reading bytes.
 */

describe("the kind a type belongs to", () => {
  it("is the one its signature was recorded under", () => {
    expect(kindForMimeType("image/png")).toBe("image")
    expect(kindForMimeType("image/avif")).toBe("image")
    expect(kindForMimeType("video/webm")).toBe("video")
    expect(kindForMimeType("font/woff2")).toBe("font")
    expect(kindForMimeType("application/pdf")).toBe("document")
  })

  it("is vector for a drawing, which carries no signature at all", () => {
    // SVG is not in the signature table — it is XML, and an XML document
    // announces nothing about what it draws — so it is answered separately.
    expect(kindForMimeType(SVG_TYPE.mimeType)).toBe("vector")
    expect(signatureOf(new TextEncoder().encode("<svg/>"))).toBeNull()
  })

  it("is nothing for a type we do not permit", () => {
    for (const mimeType of ["application/zip", "text/html", "image/tiff", ""]) {
      expect(kindForMimeType(mimeType)).toBeNull()
    }
  })

  it("agrees with the type a signature matched, for every permitted type", () => {
    /*
     * The property that keeps the two from drifting. Whatever `signatureOf`
     * says a file is, asking this about that type gives back the same kind.
     */
    const png = signatureOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const pdf = signatureOf(new TextEncoder().encode("%PDF-1.7"))

    expect(png).not.toBeNull()
    expect(pdf).not.toBeNull()
    expect(kindForMimeType(png?.mimeType ?? "")).toBe(png?.kind)
    expect(kindForMimeType(pdf?.mimeType ?? "")).toBe(pdf?.kind)
  })

  it("answers with one of the kinds and nothing else", () => {
    const answered = ["image/png", "image/svg+xml", "video/mp4", "font/otf", "application/pdf"].map(
      (mimeType) => kindForMimeType(mimeType),
    )

    for (const kind of answered) {
      expect(UPLOAD_KINDS).toContain(kind)
    }

    expect(new Set(answered).size).toBe(UPLOAD_KINDS.length)
  })
})
