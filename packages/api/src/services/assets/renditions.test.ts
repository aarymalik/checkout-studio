import { randomBytes } from "node:crypto"

import { RENDITION_SIZES, RENDITION_WIDTHS } from "@checkout-studio/schema"
import type { RenditionFormat, RenditionSize } from "@checkout-studio/schema"
import sharp from "sharp"
import type { Sharp } from "sharp"
import { describe, expect, it } from "vitest"

import { reencodeRaster, rasterEncoder } from "./raster"
import { deriveRenditions, type Rendition, type RenditionsResult } from "./renditions"

/**
 * The sizes and formats a stored image is served as.
 *
 * The masters here are made the way a real one is — through `reencodeRaster`,
 * from a picture with gradients and grain in it. A flat colour would compress
 * to almost nothing at every size and the comparisons between them would mean
 * nothing.
 */

/** Gradients plus grain: something a lossy encoder has to work at. */
function picture(width: number, height: number): Sharp {
  const pixels = Buffer.alloc(width * height * 3)
  const grain = randomBytes(width * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3
      const speck = ((grain[y * width + x] ?? 0) - 128) * 0.12

      pixels[at] = clamp(120 + 100 * Math.sin(x / 90) + speck)
      pixels[at + 1] = clamp(110 + 90 * Math.cos(y / 70) + speck)
      pixels[at + 2] = clamp(140 + 80 * Math.sin((x + y) / 110) + speck)
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } })
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

async function master(width: number, height: number): Promise<Uint8Array> {
  const jpeg = await picture(width, height).jpeg({ quality: 90 }).toBuffer()
  const encoder = rasterEncoder("image/jpeg")

  if (encoder === null) throw new Error("no jpeg encoder")

  const written = await reencodeRaster(jpeg, encoder)

  if (!written.ok) throw new Error(`master refused: ${written.reason}`)

  return written.bytes
}

async function animated(width: number, height: number, frames: number): Promise<Uint8Array> {
  const pages = await Promise.all(
    Array.from({ length: frames }, (_, index) =>
      picture(width, height)
        .modulate({ hue: index * 40 })
        .png()
        .toBuffer(),
    ),
  )

  return new Uint8Array(
    await sharp(pages, { join: { across: 1, animated: true } })
      .gif({ loop: 0 })
      .toBuffer(),
  )
}

/*
 * Computed once. Each of these is a re-encode plus up to six resizes, two of
 * them AVIF at 1920 wide, which libvips measures in seconds — a suite that
 * built them per test would spend half a minute doing it.
 */
const WIDE_MASTER = await master(2400, 600)
const WIDE = await deriveRenditions(WIDE_MASTER)
const MOVING = await deriveRenditions(await animated(1200, 300, 3))

function made(result: RenditionsResult): readonly Rendition[] {
  if (!result.ok) throw new Error(`refused: ${result.reason}`)

  return result.renditions
}

function named(renditions: readonly Rendition[]): string[] {
  return renditions.map((rendition) => `${rendition.size}/${rendition.format}`)
}

function one(
  renditions: readonly Rendition[],
  size: RenditionSize,
  format: RenditionFormat,
): Rendition {
  const found = renditions.find(
    (rendition) => rendition.size === size && rendition.format === format,
  )

  if (found === undefined) throw new Error(`no ${size}/${format}`)

  return found
}

describe("a master wider than every size", () => {
  it("earns all three sizes in both formats", async () => {
    const renditions = made(WIDE)

    expect(named(renditions)).toEqual([
      "thumbnail/webp",
      "thumbnail/avif",
      "medium/webp",
      "medium/avif",
      "large/webp",
      "large/avif",
    ])
  })

  it("is resized to the width each size names", async () => {
    const renditions = made(WIDE)

    for (const rendition of renditions) {
      expect(rendition.width).toBe(RENDITION_WIDTHS[rendition.size])
    }
  })

  it("keeps the shape of the picture", async () => {
    // 2400x600 is four to one, and so is every rendition of it.
    const renditions = made(WIDE)

    for (const rendition of renditions) {
      expect(rendition.width / rendition.height).toBeCloseTo(4, 1)
    }
  })

  it("reports the dimensions the file actually has", async () => {
    /*
     * These are written into a `srcset` and an `<img>`, and a wrong number
     * there is a layout shift on a page that takes card details.
     */
    const renditions = made(WIDE)

    for (const rendition of renditions) {
      const read = await sharp(Buffer.from(rendition.bytes)).metadata()

      expect([read.width, read.height]).toEqual([rendition.width, rendition.height])
    }
  })

  it("derives each one from the master and not from another rendition", async () => {
    /*
     * What the clones in the loop are for. Deriving a medium from a thumbnail
     * would be an upscale of a picture that had already been thrown away, and
     * the width would come out right while the image came out blurred — so the
     * dimensions cannot be what pins this. Every rendition has to be the one
     * the master alone would produce, byte for byte.
     *
     * This also pins the delivery qualities, which are what the bytes are.
     */
    for (const rendition of made(WIDE)) {
      const base = sharp(Buffer.from(WIDE_MASTER), {
        animated: true,
        autoOrient: true,
        failOn: "error",
      })
        .resize({ width: rendition.width })
        .keepIccProfile()

      const alone =
        rendition.format === "webp"
          ? await base.webp({ quality: 82 }).toBuffer()
          : await base.avif({ quality: 60 }).toBuffer()

      expect(Buffer.from(rendition.bytes).equals(alone)).toBe(true)
    }
  })

  it("is smaller the smaller it gets", async () => {
    const renditions = made(WIDE)

    for (const format of ["webp", "avif"] as const) {
      const sizes = RENDITION_SIZES.map((size) => one(renditions, size, format).bytes.length)

      expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
    }
  })

  it("is served as the type it was written as", async () => {
    const renditions = made(WIDE)

    for (const rendition of renditions) {
      expect(rendition.mimeType).toBe(`image/${rendition.format}`)
      // AVIF is an ISO base media file, which libvips reports by its container.
      const read = await sharp(Buffer.from(rendition.bytes)).metadata()

      expect(read.format).toBe(rendition.format === "avif" ? "heif" : "webp")
    }
  })

  it("carries no metadata into any of them", async () => {
    const renditions = made(WIDE)

    for (const rendition of renditions) {
      const read = await sharp(Buffer.from(rendition.bytes)).metadata()

      expect(read.exif).toBeUndefined()
      expect(read.xmp).toBeUndefined()
    }
  })
})

describe("the widths themselves", () => {
  it("are the ones a srcset is written from", async () => {
    /*
     * Pinned, because they are a contract with the renderer rather than a
     * tuning knob: a `srcset` names them, and changing one silently changes
     * which file every published checkout asks for.
     */
    expect(RENDITION_WIDTHS).toEqual({ thumbnail: 320, medium: 960, large: 1920 })
    expect(RENDITION_SIZES).toEqual(["thumbnail", "medium", "large"])
  })

  it("keep the master's colour profile", async () => {
    /*
     * The master kept its ICC profile because libvips converts no colourspace
     * on its own. A rendition that dropped it would be the oversaturated
     * version of the picture the merchant approved.
     */
    const wide = await picture(1200, 300).withIccProfile("p3").jpeg({ quality: 90 }).toBuffer()
    const encoder = rasterEncoder("image/jpeg")

    if (encoder === null) throw new Error("no jpeg encoder")

    const stored = await reencodeRaster(wide, encoder)

    expect(stored.ok).toBe(true)
    if (!stored.ok) return
    expect((await sharp(Buffer.from(stored.bytes)).metadata()).icc).toBeDefined()

    for (const rendition of made(await deriveRenditions(stored.bytes))) {
      const read = await sharp(Buffer.from(rendition.bytes)).metadata()

      expect(read.icc).toBeDefined()
    }
  })
})

describe("a master no wider than a size", () => {
  it("skips that size rather than upscaling", async () => {
    // 1200 wide: a thumbnail and a medium are narrower than it, a large is not.
    const renditions = made(await deriveRenditions(await master(1200, 300)))

    expect(named(renditions)).toEqual([
      "thumbnail/webp",
      "thumbnail/avif",
      "medium/webp",
      "medium/avif",
    ])
  })

  it("skips a size it matches exactly, which would be a copy", async () => {
    const renditions = made(await deriveRenditions(await master(960, 240)))

    expect(named(renditions)).toEqual(["thumbnail/webp", "thumbnail/avif"])
  })

  it("earns none at all when it is already the smallest honest version", async () => {
    /*
     * A small logo. Nothing is produced, and what gets served is the master —
     * which is the point of not producing anything, since three names for the
     * same pixels would be three files to store and keep consistent.
     */
    const renditions = made(await deriveRenditions(await master(240, 60)))

    expect(renditions).toEqual([])
  })
})

describe("an animated master", () => {
  it("keeps the animation in every rendition", async () => {
    const renditions = made(MOVING)

    for (const rendition of renditions) {
      const read = await sharp(Buffer.from(rendition.bytes), { animated: true }).metadata()

      expect(read.pages).toBe(3)
    }
  })

  it("is offered as WebP only", async () => {
    /*
     * Writing an animation as AVIF silently returns the first frame. A logo
     * that stopped moving in the format most browsers prefer, with nothing to
     * say why, is worse than one format fewer.
     */
    const renditions = made(MOVING)

    expect(named(renditions)).toEqual(["thumbnail/webp", "medium/webp"])
  })

  it("reports one frame's dimensions and not the whole strip", async () => {
    const renditions = made(MOVING)
    const thumbnail = one(renditions, "thumbnail", "webp")

    expect([thumbnail.width, thumbnail.height]).toEqual([320, 80])
  })

  it("is measured across its frames against the pixel ceiling", async () => {
    // Three 1200x300 frames are 1.08 million pixels read as one strip.
    const result = await deriveRenditions(await animated(1200, 300, 3), 1_000_000)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-many-pixels")
  })
})

describe("bytes that are not the master we stored", () => {
  it("refuses a corrupt header", async () => {
    const result = await deriveRenditions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unreadable")
  })

  it("refuses a header that reads over pixels that do not", async () => {
    const whole = await master(800, 200)
    const truncated = whole.subarray(0, Math.floor(whole.length * 0.6))

    expect((await sharp(Buffer.from(truncated)).metadata()).width).toBe(800)

    const result = await deriveRenditions(truncated)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unreadable")
  })

  it("refuses more pixels than it will decode", async () => {
    const result = await deriveRenditions(await master(2400, 600), 1_000_000)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-many-pixels")
  })
})
