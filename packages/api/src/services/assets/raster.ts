import "server-only"

import sharp from "sharp"
import type { Sharp } from "sharp"

/**
 * A raster image, re-encoded into one this server wrote.
 *
 * ## Why re-encode rather than edit
 *
 * docs/security.md § Image Security asks for three things — strip metadata,
 * reject malformed images, optimize — and the first two are the same thing said
 * twice. Metadata could be removed by rewriting the container: drop the EXIF
 * segment from a JPEG, keep only the critical chunks of a PNG. Everything else
 * in the file would then still be bytes a stranger wrote, and a container
 * crafted to trip a decoder would reach every browser we served it to.
 *
 * So the pixels are decoded and encoded again, and the stored file is the
 * encoder's output. That is the same bargain `svg.ts` makes — the emitter is
 * the boundary — and it is why "no original upload is ever served" is true of
 * images and not only of drawings. A malformed file cannot be re-encoded,
 * which is how rejecting one stops being a separate check.
 *
 * ## librsvg is in this binary and is never reached
 *
 * The `sharp` override in the root `package.json` exists because of an advisory
 * in the librsvg that libvips bundles. Nothing here can reach it: a vector is
 * identified by `looksLikeSvg` before this module is consulted, is refused by
 * `inspectUpload` as `needs-sanitizing`, and is answered by our own sanitizer.
 * The only inputs that arrive are the five raster signatures in
 * `@checkout-studio/utils`, and `rasterEncoder` is the list of them — so a
 * format gaining an entry here is a deliberate edit, never a consequence of
 * libvips learning to read something new.
 *
 * See docs/security.md § Image Security and docs/phases.md Phase 14.
 */

export type RasterRefusal =
  /** libvips would not decode it: a corrupt header, or truncated pixel data. */
  | "unreadable"
  /** Small enough to accept, large enough to decode into a denial of service. */
  | "too-many-pixels"

export interface RasterReencoded {
  ok: true
  /** The bytes to store. Written by the encoder, not by whoever uploaded. */
  bytes: Uint8Array
}

export interface RasterRefused {
  ok: false
  reason: RasterRefusal
}

export type RasterResult = RasterReencoded | RasterRefused

/**
 * The ceiling on decoded pixels, counting every frame.
 *
 * The size ceiling in `inspectUpload` bounds the *compressed* file, which says
 * nothing about the work of decoding it: a few kilobytes of PNG can describe
 * 20000x20000, and libvips would ask for four bytes a pixel to find out. Fifty
 * megapixels is about 200 MB of decoded image, which is already more than one
 * upload should cost. It is five times below libvips' own default, and
 * comfortably above anything a camera produces.
 *
 * Read with `animated: true` a multi-frame image is one tall strip, so this
 * bounds total work rather than frame size — a 1000x1000 animation may have
 * fifty frames, and its file would hit the size ceiling long before that.
 */
export const MAX_PIXELS = 50_000_000

/** Chooses the output format and its settings. Nothing else touches the pixels. */
export type RasterEncoder = (image: Sharp) => Sharp

/**
 * How each permitted raster is written back.
 *
 * Every entry writes the format it read, so an upload keeps the type its
 * signature named and the asset record does not have to explain a conversion
 * nobody asked for. Deriving WebP and AVIF renditions is a separate job done
 * from the stored master, not something done to it.
 *
 * A lossless format stays lossless. A lossy one is re-encoded at a quality
 * chosen to be invisible rather than to save bytes, because this is the master
 * copy every rendition will be derived from and the generational loss happens
 * exactly once. Saving bytes is the renditions' job.
 */
const ENCODERS: Readonly<Record<string, RasterEncoder>> = {
  // Lossless, at the slowest setting, because a master is written once and
  // read forever — and because this is what keeps a re-encode from growing.
  "image/png": (image) => image.png({ compressionLevel: 9 }),
  // mozjpeg's defaults, which cost encode time and buy roughly a fifth of the
  // file back at the same quality.
  "image/jpeg": (image) => image.jpeg({ quality: 90, mozjpeg: true }),
  // Lossless by construction: a GIF is a palette.
  "image/gif": (image) => image.gif(),
  "image/webp": (image) => image.webp({ quality: 90 }),
  // AVIF's scale is not JPEG's; 80 is the visually transparent end of it.
  "image/avif": (image) => image.avif({ quality: 80 }),
}

/**
 * The encoder for a media type, or null if it is not a raster we re-encode.
 *
 * This is the one place that decides, so `acceptUpload` does not need a second
 * opinion about what an image is. A font, a video and a PDF get null and are
 * stored as they arrived; each is a format we neither decode nor serve inline.
 */
export function rasterEncoder(mimeType: string): RasterEncoder | null {
  return ENCODERS[mimeType] ?? null
}

/**
 * Decode, drop everything that is not pixels, and write it again.
 *
 * What the output does not carry: EXIF — and with it the camera, the serial
 * number and the GPS coordinates of wherever the photograph was taken — XMP,
 * IPTC, and the orientation tag. libvips writes none of them unless asked, and
 * nothing here asks.
 *
 * Two deliberate exceptions, both because the alternative is a picture that
 * does not look like the one the merchant uploaded:
 *
 * `autoOrient` applies the EXIF orientation to the pixels before the tag is
 * dropped. Without it, stripping metadata would turn every phone photograph
 * that displayed upright into one lying on its side — the metadata would be
 * gone and the image would be wrong, which is a worse outcome than either.
 *
 * `keepIccProfile` carries the colour profile over. It is the only part of the
 * input that reaches the output unexamined, and it is worth it: libvips does
 * not convert colourspaces on its own, so dropping a Display P3 profile leaves
 * wide-gamut values to be read as sRGB and every such upload arrives
 * oversaturated. A profile describes how to read colours and names no person,
 * no place and no device owner, so keeping it gives up none of the privacy the
 * rest of this is for.
 *
 * `failOn: "error"` sits between two settings that are both wrong. `"none"`
 * accepts a truncated file and stores whichever half of the picture decoded,
 * which is a broken upload presented as a good one. libvips' own default,
 * `"warning"`, refuses files that every browser renders — real export tools
 * produce JPEGs libjpeg complains about — and turning away a merchant's
 * working photograph over a complaint would be the wrong trade. It is also
 * unnecessary: the complaint does not survive the re-encoding, because what
 * gets stored is what our own encoder wrote.
 */
export async function reencodeRaster(
  bytes: Uint8Array,
  encode: RasterEncoder,
  maxPixels: number = MAX_PIXELS,
): Promise<RasterResult> {
  const open = (limitInputPixels: number | false): Sharp =>
    sharp(bytes, { animated: true, autoOrient: true, failOn: "error", limitInputPixels })

  try {
    /*
     * The header first, so the refusal can say which ceiling was passed.
     *
     * Read with the limit off, because libvips enforces it the moment it is
     * asked anything and raises the same error a corrupt file does — the
     * merchant would be told to fix the wrong thing. A header is the
     * dimensions and not the image, so reading one costs nothing, and with
     * `animated: true` the height spans every frame.
     */
    const { width, height } = await open(false).metadata()

    if (width * height > maxPixels) return { ok: false, reason: "too-many-pixels" }

    /*
     * And enforced again on the decode, because a header is a claim. A file
     * that understates its dimensions would pass the check above and libvips
     * would still refuse to allocate past the ceiling.
     */
    const written = await encode(open(maxPixels).keepIccProfile()).toBuffer()

    return { ok: true, bytes: new Uint8Array(written) }
  } catch {
    /*
     * Everything libvips refuses is one answer: we could not read this.
     *
     * There is nothing to distinguish between — a corrupt header, truncated
     * pixel data and a format compiled out of this binary are all a file the
     * merchant has to replace, and the only honest thing to say is so.
     */
    return { ok: false, reason: "unreadable" }
  }
}
