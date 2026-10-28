import { signatureOf } from "@checkout-studio/utils"
import sharp from "sharp"
import type { Sharp } from "sharp"
import { beforeAll, describe, expect, it } from "vitest"

import { MAX_PIXELS, rasterEncoder, reencodeRaster } from "./raster"
import type { RasterEncoder, RasterResult } from "./raster"

/**
 * A raster image, re-encoded into one this server wrote.
 *
 * ## The fixtures are built with the library under test
 *
 * Deliberately. What is being tested is not whether libvips can write a PNG —
 * it can — but what this module asks it to do: which metadata survives, which
 * does not, what happens to a photograph's orientation, and what is refused.
 * Asking sharp to produce a JPEG carrying GPS coordinates is the only
 * convenient way to have one, and a fixture that already lacked them would
 * prove nothing about the stripping.
 *
 * The files that have to be wrong — a corrupt header, truncated pixels — are
 * written by hand, because an encoder will not produce them.
 */

const SOLID = { r: 79, g: 70, b: 229 }

/** Noise, so a compressed fixture has something incompressible to carry. */
function noise(width: number, height: number): Sharp {
  const data = Buffer.alloc(width * height * 3)

  for (let index = 0; index < data.length; index += 1) {
    data[index] = (index * 2_654_435_761) % 251
  }

  return sharp(data, { raw: { width, height, channels: 3 } })
}

function solid(width: number, height: number): Sharp {
  return sharp({ create: { width, height, channels: 3, background: SOLID } })
}

async function frames(count: number): Promise<Buffer[]> {
  const shades = Array.from({ length: count }, (_, index) => ({
    r: 20 * index,
    g: 40,
    b: 200 - 20 * index,
  }))

  return Promise.all(
    shades.map((background) =>
      sharp({ create: { width: 10, height: 8, channels: 3, background } })
        .png()
        .toBuffer(),
    ),
  )
}

function animation(pages: Buffer[]): Sharp {
  return sharp(pages, { join: { across: 1, animated: true } })
}

function encoder(mimeType: string): RasterEncoder {
  const found = rasterEncoder(mimeType)

  if (found === null) throw new Error(`no encoder for ${mimeType}`)

  return found
}

async function reencode(bytes: Uint8Array, mimeType: string, maxPixels?: number) {
  return reencodeRaster(bytes, encoder(mimeType), maxPixels)
}

function written(result: RasterResult): Uint8Array {
  if (!result.ok) throw new Error(`refused: ${result.reason}`)

  return result.bytes
}

function read(bytes: Uint8Array): Sharp {
  return sharp(Buffer.from(bytes), { animated: true })
}

describe("choosing an encoder", () => {
  it("has one for every raster the boundary accepts", () => {
    const rasters = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]

    for (const mimeType of rasters) {
      expect(rasterEncoder(mimeType)).not.toBeNull()
    }
  })

  it("has none for a type we store as it arrived", () => {
    // A font, a video and a PDF. We decode none of them, so there is no
    // encoder whose output could stand in for the upload.
    for (const mimeType of ["font/woff2", "video/mp4", "application/pdf"]) {
      expect(rasterEncoder(mimeType)).toBeNull()
    }
  })

  it("has none for a vector, which has its own sanitizer", () => {
    /*
     * The one that matters. libvips renders SVG through librsvg, which is
     * where the advisory behind the `sharp` override lives. An entry here
     * would be the only way to reach it.
     */
    expect(rasterEncoder("image/svg+xml")).toBeNull()
  })
})

describe("a photograph's metadata", () => {
  let photo: Buffer

  beforeAll(async () => {
    photo = await solid(40, 20)
      .withExif({
        IFD0: { Make: "Acme", Model: "A-1", Software: "Darkroom" },
        // IFD3 is the GPS directory. Coordinates are written as numbers, so
        // they leave no searchable string — what the byte check below proves
        // is that the whole EXIF block went, which is where they lived.
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" },
      })
      .withIccProfile("p3")
      .jpeg()
      .toBuffer()
  })

  it("arrives carrying all of it", async () => {
    const before = await sharp(photo).metadata()

    expect(before.exif).toBeDefined()
    expect(before.icc).toBeDefined()
    expect(Buffer.from(photo).toString("latin1")).toContain("Exif")
  })

  it("is stored without the EXIF block", async () => {
    const after = await read(written(await reencode(photo, "image/jpeg"))).metadata()

    expect(after.exif).toBeUndefined()
    expect(after.xmp).toBeUndefined()
    expect(after.iptc).toBeUndefined()
  })

  it("is stored without the words that were in it", async () => {
    /*
     * Not the same assertion as the one above. That one trusts libvips to
     * report what it wrote; this one reads the bytes. The camera's make and
     * the editing software are the strings the fixture put there, and `Exif`
     * is the marker introducing the block that held them and the coordinates.
     * The only proof any of it is gone is that none of it is in the file.
     */
    const text = Buffer.from(written(await reencode(photo, "image/jpeg"))).toString("latin1")

    expect(text).not.toContain("Acme")
    expect(text).not.toContain("Darkroom")
    expect(text).not.toContain("Exif")
  })

  it("keeps the colour profile", async () => {
    // Dropping it would leave wide-gamut values to be read as sRGB, and the
    // merchant's photograph would arrive oversaturated.
    const after = await read(written(await reencode(photo, "image/jpeg"))).metadata()

    expect(after.icc).toBeDefined()
  })
})

describe("a photograph that was taken sideways", () => {
  let sideways: Buffer

  beforeAll(async () => {
    sideways = await solid(40, 20).withMetadata({ orientation: 6 }).jpeg().toBuffer()
  })

  it("arrives as pixels plus a note about which way up", async () => {
    const before = await sharp(sideways).metadata()

    expect(before.orientation).toBe(6)
    expect([before.width, before.height]).toEqual([40, 20])
  })

  it("is stored rotated, so losing the note loses nothing", async () => {
    /*
     * The whole reason `autoOrient` is on. Stripping the orientation tag
     * without applying it would turn every phone photograph that displayed
     * upright into one lying on its side: the metadata gone and the picture
     * wrong, which is worse than either alone.
     */
    const after = await read(written(await reencode(sideways, "image/jpeg"))).metadata()

    expect([after.width, after.height]).toEqual([20, 40])
    expect(after.orientation).toBeUndefined()
  })
})

describe("the format it arrived as", () => {
  const cases = [
    { mimeType: "image/png", write: (image: Sharp) => image.png() },
    { mimeType: "image/jpeg", write: (image: Sharp) => image.jpeg() },
    { mimeType: "image/gif", write: (image: Sharp) => image.gif() },
    { mimeType: "image/webp", write: (image: Sharp) => image.webp() },
    { mimeType: "image/avif", write: (image: Sharp) => image.avif() },
  ]

  it.each(cases)("is the format $mimeType is stored as", async ({ mimeType, write }) => {
    /*
     * The invariant that keeps the asset record honest: what comes out passes
     * the same gate as what went in, and names the same type. An upload keeps
     * the type its signature matched, so nothing downstream has to explain a
     * conversion nobody asked for.
     */
    const source = await write(noise(24, 24)).toBuffer()

    expect(signatureOf(source)?.mimeType).toBe(mimeType)

    const stored = written(await reencode(source, mimeType))

    expect(signatureOf(stored)?.mimeType).toBe(mimeType)
  })

  it("is stable, so re-encoding what we stored changes nothing", async () => {
    // A lossless format round-trips to the same bytes, which is what lets the
    // content hash be a deduplication key rather than a coincidence.
    const source = await noise(60, 60).png({ compressionLevel: 3 }).toBuffer()

    const once = written(await reencode(source, "image/png"))
    const twice = written(await reencode(once, "image/png"))

    expect(Buffer.from(twice).equals(Buffer.from(once))).toBe(true)
  })

  it("gives two files that differ only in metadata the same bytes", async () => {
    /*
     * The raster half of the deduplication promise. The same photograph
     * exported twice by two tools carries two different EXIF blocks and the
     * same picture, and what we store is the picture.
     */
    const one = await solid(32, 32)
      .withExif({ IFD0: { Make: "Acme" } })
      .jpeg()
      .toBuffer()
    const two = await solid(32, 32)
      .withExif({ IFD0: { Software: "Zed" }, IFD3: { GPSLatitudeRef: "N" } })
      .jpeg()
      .toBuffer()

    expect(one.equals(two)).toBe(false)

    const storedOne = written(await reencode(one, "image/jpeg"))
    const storedTwo = written(await reencode(two, "image/jpeg"))

    expect(Buffer.from(storedTwo).equals(Buffer.from(storedOne))).toBe(true)
  })
})

describe("an animation", () => {
  it("keeps every frame", async () => {
    /*
     * Read without `animated`, libvips hands back the first frame and nothing
     * says so — a merchant's animated logo would arrive as a still, and the
     * only sign would be that it stopped moving.
     */
    const source = await animation(await frames(3))
      .gif({ loop: 0, delay: 80 })
      .toBuffer()

    expect((await read(source).metadata()).pages).toBe(3)

    const stored = await read(written(await reencode(source, "image/gif"))).metadata()

    expect(stored.pages).toBe(3)
    expect(stored.loop).toBe(0)
  })

  it("keeps every frame of an animated WebP too", async () => {
    const source = await animation(await frames(3))
      .webp({ loop: 0 })
      .toBuffer()

    const stored = await read(written(await reencode(source, "image/webp"))).metadata()

    expect(stored.pages).toBe(3)
  })

  it("is measured across all of its frames", async () => {
    /*
     * The pixel ceiling bounds the work, not the picture. Read as one tall
     * strip, three 10x8 frames are 240 pixels and not 80, so an animation
     * cannot slip past a cap that one of its frames would clear.
     */
    const source = await animation(await frames(3))
      .gif()
      .toBuffer()

    const refused = await reencode(source, "image/gif", 200)

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toBe("too-many-pixels")

    expect((await reencode(source, "image/gif", 240)).ok).toBe(true)
  })
})

describe("a file that cannot be read", () => {
  it("is refused when its header is corrupt", async () => {
    const result = await reencode(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
      "image/jpeg",
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unreadable")
  })

  it("is refused when its header is fine and its pixels are not", async () => {
    /*
     * The other half of unreadable, and the reason one answer covers both: the
     * dimensions read back correctly from this file, so nothing short of
     * decoding it could tell. A merchant has to replace it either way.
     */
    const whole = await noise(40, 40).png().toBuffer()
    const truncated = whole.subarray(0, Math.floor(whole.length * 0.6))

    expect((await sharp(truncated).metadata()).width).toBe(40)

    const result = await reencode(truncated, "image/png")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unreadable")
  })
})

describe("a file that is damaged and still readable", () => {
  it("is accepted, and stored as a clean one", async () => {
    /*
     * Why `failOn` is `"error"` and not libvips' stricter default. This is a
     * JPEG with twelve bytes of its scan data overwritten: libjpeg complains
     * about it and decodes it anyway, which is what every browser does with
     * the damaged files real export tools produce. Refusing a merchant's
     * working photograph over a complaint would be the wrong trade, and it is
     * also unnecessary — what we store is written by our own encoder, so the
     * complaint does not survive the re-encoding.
     */
    const whole = await noise(64, 64).jpeg({ quality: 80 }).toBuffer()
    const damaged = Buffer.from(whole)

    damaged.fill(0x7f, Math.floor(damaged.length * 0.7), Math.floor(damaged.length * 0.7) + 12)

    const stored = written(await reencode(damaged, "image/jpeg"))

    // And out the other side it is an image libvips has no complaint about.
    expect((await sharp(stored, { failOn: "warning" }).metadata()).width).toBe(64)
  })
})

describe("a file small enough to accept and too large to decode", () => {
  it("is refused for its pixels, not its size", async () => {
    /*
     * The attack the size ceiling cannot see. Four megapixels of one colour
     * compress to a few kilobytes, and twenty thousand squared would too — the
     * cost is in the decoding, which asks for four bytes a pixel before
     * anything has looked at the file.
     */
    const bomb = await solid(2000, 2000).png({ compressionLevel: 9 }).toBuffer()

    expect(bomb.length).toBeLessThan(100_000)

    const result = await reencode(bomb, "image/png", 1_000_000)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-many-pixels")
  })

  it("is measured against a ceiling well below libvips' own", async () => {
    // Fifty megapixels is about 200 MB of decoded image. libvips would allow
    // five times that before complaining.
    expect(MAX_PIXELS).toBe(50_000_000)
    expect((await reencode(await solid(400, 400).png().toBuffer(), "image/png")).ok).toBe(true)
  })
})
