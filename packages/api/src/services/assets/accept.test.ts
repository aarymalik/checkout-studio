import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { acceptUpload } from "./accept"
import type { AcceptResult } from "./accept"
import { reencodeRaster, rasterEncoder } from "./raster"
import type { RasterEncoder } from "./raster"

/**
 * The upload, turned into the bytes we will store.
 *
 * What these protect is that the caller never stores what it was handed. For a
 * drawing the stored document is one this server wrote; for a photograph the
 * stored file is one its encoder wrote. Everything recorded about the asset —
 * the hash above all — describes that file rather than the upload it came from.
 *
 * What each transform does to the bytes is covered next door, in `svg.test.ts`
 * and `raster.test.ts`. These are about the choice between them, and about the
 * asset record agreeing with the file.
 */

const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>'

/** `wOF2`, and then enough bytes to be a file. We decode no font. */
const FONT = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00, 0x11, 0x22])

const PHOTO = new Uint8Array(
  await sharp({ create: { width: 48, height: 32, channels: 3, background: "#4f46e5" } })
    .withExif({ IFD0: { Make: "Acme", Software: "Darkroom" } })
    .jpeg()
    .toBuffer(),
)

const PICTURE = new Uint8Array(
  await sharp({ create: { width: 24, height: 24, channels: 3, background: "#0ea5e9" } })
    .png()
    .toBuffer(),
)

function png(bytes: Uint8Array = PICTURE, limits?: { image: number }): Promise<AcceptResult> {
  return limits === undefined
    ? acceptUpload({ bytes, fileName: "a.png" })
    : acceptUpload({ bytes, fileName: "a.png", limits })
}

function svg(markup: string): Promise<AcceptResult> {
  return acceptUpload({ bytes: new TextEncoder().encode(markup), fileName: "logo.svg" })
}

function accepted(result: AcceptResult) {
  if (!result.ok) throw new Error(`refused: ${result.reason}`)

  return { ...result, text: new TextDecoder().decode(result.bytes) }
}

function encoder(mimeType: string): RasterEncoder {
  const found = rasterEncoder(mimeType)

  if (found === null) throw new Error(`no encoder for ${mimeType}`)

  return found
}

describe("a type we store as it arrived", () => {
  it("passes the bytes through", async () => {
    /*
     * A font, and the same is true of a video and a PDF. We decode none of
     * them, so there is no encoder whose output could stand in for the upload,
     * and rewriting a file we cannot read would be guessing.
     */
    const result = accepted(await acceptUpload({ bytes: FONT, fileName: "a.woff2" }))

    expect(result.bytes).toBe(FONT)
    expect(result.type.mimeType).toBe("font/woff2")
    expect(result.removed).toEqual([])
  })

  it("passes a refusal through unchanged", async () => {
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02])
    const result = await acceptUpload({ bytes: elf, fileName: "a.png" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unrecognised")
  })

  it("keeps the ceiling a refusal named", async () => {
    const big = new Uint8Array(11_000_000)
    big.set(PICTURE, 0)

    const result = await png(big)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-large")
    expect(result.limit).toBe(10_000_000)
  })

  it("honours a limit override", async () => {
    expect((await png(PICTURE, { image: 4 })).ok).toBe(false)
  })
})

describe("a raster, which is decoded and written again", () => {
  it("is stored as the file its encoder wrote, not the one that arrived", async () => {
    const result = accepted(await png())

    expect(result.bytes).not.toBe(PICTURE)
    expect(result.type.mimeType).toBe("image/png")
    expect(result.removed).toEqual([])
  })

  it("is stored without the metadata it arrived with", async () => {
    const result = accepted(await acceptUpload({ bytes: PHOTO, fileName: "p.jpg" }))

    expect(await sharp(Buffer.from(PHOTO)).metadata()).toHaveProperty("exif")
    expect((await sharp(Buffer.from(result.bytes)).metadata()).exif).toBeUndefined()
  })

  it("hashes and measures what is stored", async () => {
    /*
     * The deduplication key has to name the file that exists. Hashing the
     * upload would key a file nobody has, and two photographs differing only
     * in their EXIF would be two rows pointing at identical bytes.
     */
    const result = accepted(await acceptUpload({ bytes: PHOTO, fileName: "p.jpg" }))
    const alone = await reencodeRaster(PHOTO, encoder("image/jpeg"))

    expect(alone.ok).toBe(true)
    if (!alone.ok) return
    expect(result.sha256).not.toBe(
      accepted(await acceptUpload({ bytes: FONT, fileName: "a.woff2" })).sha256,
    )
    expect(Buffer.from(result.bytes).equals(Buffer.from(alone.bytes))).toBe(true)
    expect(result.sizeBytes).toBe(result.bytes.length)
    expect(result.sizeBytes).not.toBe(PHOTO.length)
  })

  it("gives two photographs that differ only in metadata the same hash", async () => {
    /*
     * The raster half of the deduplication promise, and the reason the hash
     * cannot be the one the boundary computed: these two uploads are different
     * bytes and the same picture. Keying on what arrived would store the
     * picture twice.
     */
    const other = new Uint8Array(
      await sharp({ create: { width: 48, height: 32, channels: 3, background: "#4f46e5" } })
        .withExif({ IFD0: { Software: "Zed" }, IFD3: { GPSLatitudeRef: "N" } })
        .jpeg()
        .toBuffer(),
    )

    expect(Buffer.from(other).equals(Buffer.from(PHOTO))).toBe(false)

    const one = accepted(await acceptUpload({ bytes: PHOTO, fileName: "p.jpg" }))
    const two = accepted(await acceptUpload({ bytes: other, fileName: "q.jpg" }))

    expect(two.sha256).toBe(one.sha256)
    expect(Buffer.from(two.bytes).equals(Buffer.from(one.bytes))).toBe(true)
  })

  it("passes a decoding refusal on as its own reason", async () => {
    const result = await acceptUpload({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
      fileName: "p.jpg",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unreadable")
  })

  it("passes the pixel ceiling down and reports what it refused", async () => {
    // A few kilobytes of one colour, four megapixels once decoded. The size
    // ceiling cannot see this; the pixel one is the whole point.
    const bomb = new Uint8Array(
      await sharp({ create: { width: 2000, height: 2000, channels: 3, background: "#000" } })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    )

    expect(bomb.length).toBeLessThan(100_000)

    const result = await acceptUpload({ bytes: bomb, fileName: "a.png", maxPixels: 1_000_000 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-many-pixels")
  })

  it("refuses a file that only grew past the ceiling once we wrote it", async () => {
    /*
     * An encoder can hand back more than it was given: this is a JPEG saved at
     * a quality nobody would choose, written out again at one we would. The
     * ceiling is about the file we keep, so the limit sits between the two
     * sizes — the upload clears it and the stored file does not.
     */
    const crushed = new Uint8Array(
      await sharp({ create: { width: 64, height: 64, channels: 3, background: "#4f46e5" } })
        .jpeg({ quality: 2 })
        .toBuffer(),
    )
    const rewritten = await reencodeRaster(crushed, encoder("image/jpeg"))

    expect(rewritten.ok).toBe(true)
    if (!rewritten.ok) return

    const limit = Math.floor((crushed.length + rewritten.bytes.length) / 2)

    expect(crushed.length).toBeLessThanOrEqual(limit)
    expect(rewritten.bytes.length).toBeGreaterThan(limit)

    const result = await acceptUpload({
      bytes: crushed,
      fileName: "a.jpg",
      limits: { image: limit },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-large")
    expect(result.limit).toBe(limit)
  })
})

describe("a vector, which the boundary would not pass", () => {
  it("is accepted once it has been rewritten", async () => {
    const result = accepted(await svg(LOGO))

    expect(result.type.mimeType).toBe("image/svg+xml")
    expect(result.text).toContain('<path d="M4 4h16v16H4z"/>')
  })

  it("is stored as the document this server wrote, not the one that arrived", async () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>`
    const result = accepted(await svg(hostile))

    expect(result.text).not.toContain("script")
    expect(result.text).not.toContain("alert")
    expect(result.removed).toEqual(["script"])
  })

  it("reports what was taken out", async () => {
    const result = accepted(
      await svg('<svg xmlns="http://www.w3.org/2000/svg" onload="a()"><path d="M0 0"/></svg>'),
    )

    expect(result.removed).toEqual(["onload"])
  })

  it("hashes what is stored and not what was sent", async () => {
    /*
     * The deduplication key has to name the file that exists. Hashing the
     * upload would key a document nobody has, and two uploads differing only
     * in a `<script>` would be two rows pointing at identical bytes.
     */
    // The same drawing, with a script in it. Identical in every other way, so
    // what is being compared is the effect of the script and nothing else.
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      "<script>alert(1)</script>" +
      '<path d="M4 4h16v16H4z"/></svg>'

    const clean = accepted(await svg(LOGO))
    const scrubbed = accepted(await svg(hostile))

    expect(scrubbed.sha256).toBe(clean.sha256)
    expect(scrubbed.text).toBe(clean.text)
  })

  it("measures the size of what is stored", async () => {
    const result = accepted(await svg(LOGO))

    expect(result.sizeBytes).toBe(result.bytes.length)
    expect(result.sizeBytes).not.toBe(new TextEncoder().encode(LOGO).length)
  })

  it("passes a sanitizing refusal on as its own reason", async () => {
    const result = await svg('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("doctype")
  })

  it("is still refused for size before anything is rewritten", async () => {
    // The boundary's ceiling applies first, so a vector too big to store is
    // never parsed. Sanitizing it would be work done to reach a refusal.
    const padded = `${LOGO}${" ".repeat(1_000_001)}`

    const result = await svg(padded)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-large")
  })

  it("refuses a name that is not a name, before sanitizing", async () => {
    const result = await acceptUpload({
      bytes: new TextEncoder().encode(LOGO),
      fileName: "../../logo.svg",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unsafe-name")
  })

  it("trims the name, as the boundary would have", async () => {
    const result = accepted(
      await acceptUpload({ bytes: new TextEncoder().encode(LOGO), fileName: "  logo.svg  " }),
    )

    expect(result.fileName).toBe("logo.svg")
  })
})
