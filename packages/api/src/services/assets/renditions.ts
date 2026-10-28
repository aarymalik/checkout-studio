import "server-only"

import { RENDITION_MIME_TYPES, RENDITION_SIZES, RENDITION_WIDTHS } from "@checkout-studio/schema"
import type { RenditionFormat, RenditionSize } from "@checkout-studio/schema"
import type { Sharp } from "sharp"

import { MAX_PIXELS, openRaster } from "./raster"
import type { RasterRefused } from "./raster"

/**
 * The sizes and formats a stored image is actually served as.
 *
 * ## Derived from the master, never from the upload
 *
 * docs/performance.md § Asset Optimization asks for a thumbnail, a medium, a
 * large and the original, and § Images asks for WebP and AVIF. The sizes, the
 * formats and the widths are in `@checkout-studio/schema`, because the
 * renderer writes a `srcset` from them and the builder records which of them
 * an asset has; this module is only the half that produces the files.
 *
 * The original is the master `reencodeRaster` wrote; these are the rest, and
 * they are derived from that master rather than from the file that arrived. It is the shorter
 * way to say the same thing the upload boundary says: nothing downstream ever
 * reads a stranger's bytes, not even to make a thumbnail of them.
 *
 * It also makes the master's quality the only one that matters. A rendition is
 * one generation from a picture encoded to be invisible, rather than two from
 * whatever was uploaded.
 *
 * ## A missing rendition is an answer
 *
 * A size wider than the master is not produced. Upscaling would invent detail,
 * and asking libvips not to enlarge would instead store three identical copies
 * of a small logo under three different names. So a 400-pixel logo has a
 * thumbnail and nothing else, and a logo narrower than a thumbnail has none at
 * all — in which case what gets served is the master, which is already the
 * smallest honest version of it.
 *
 * See docs/performance.md § Asset Optimization and docs/phases.md Phase 14.
 */

/**
 * How each delivery format is written.
 *
 * Both lossy, and both at a quality meant to be invisible at the size they
 * will be displayed. Neither is the master's setting: the master is encoded
 * once and read forever, while these are read by browsers over a network and
 * the bytes are the point.
 */
const WRITERS: Readonly<Record<RenditionFormat, (image: Sharp) => Sharp>> = {
  webp: (image) => image.webp({ quality: 82 }),
  // AVIF's scale is not WebP's, and 60 is about the same picture in roughly
  // half the bytes. It costs: a 1920-wide AVIF takes libvips a second or two,
  // which is why deriving these is a separate call and not part of accepting
  // an upload — the merchant should not be kept waiting on it.
  avif: (image) => image.avif({ quality: 60 }),
}

export interface Rendition {
  size: RenditionSize
  format: RenditionFormat
  /** The type this is served as. The one piece of format knowledge a caller needs. */
  mimeType: string
  /** As displayed, so a `srcset` entry and an `<img>` can both be written from it. */
  width: number
  height: number
  bytes: Uint8Array
}

export type RenditionsResult = { ok: true; renditions: readonly Rendition[] } | RasterRefused

/**
 * Every rendition a master earns, in the order they should be offered.
 *
 * An animated master gets WebP and no AVIF. libvips can read an animation and
 * write one as WebP, and writing one as AVIF silently returns the first frame
 * — a merchant's animated logo would stop moving in the format most browsers
 * prefer, with nothing to say why. One format that keeps the animation beats
 * two where the better one is wrong.
 *
 * The encodes run one after another rather than together. Six AVIF encodes in
 * parallel would take every core on the box for one upload, and the work is
 * already measured in seconds; whoever calls this decides how much of it to do
 * at once.
 */
export async function deriveRenditions(
  master: Uint8Array,
  maxPixels: number = MAX_PIXELS,
): Promise<RenditionsResult> {
  const opened = await openRaster(master, maxPixels)

  if (!opened.ok) return opened

  const { image, width, pages } = opened.source
  const formats: readonly RenditionFormat[] = pages > 1 ? ["webp"] : ["webp", "avif"]
  const renditions: Rendition[] = []

  try {
    for (const size of RENDITION_SIZES) {
      if (RENDITION_WIDTHS[size] >= width) continue

      const resized = image.clone().resize({ width: RENDITION_WIDTHS[size] })

      for (const format of formats) {
        // Awaited in the loop on purpose. See the note above.
        const { data, info } = await WRITERS[format](resized.clone().keepIccProfile()).toBuffer({
          resolveWithObject: true,
        })

        renditions.push({
          size,
          format,
          mimeType: RENDITION_MIME_TYPES[format],
          width: info.width,
          // For an animation the strip's height is every frame stacked.
          height: info.pageHeight ?? info.height,
          bytes: new Uint8Array(data),
        })
      }
    }
  } catch {
    /*
     * The master is a file we wrote, so reaching this means the bytes handed
     * over are not the ones we stored. There is nothing to tell apart and
     * nothing to do about it here, and the asset itself is unaffected — its
     * master is whatever is in storage. The caller decides whether an image
     * with no renditions is worth serving from the master alone.
     */
    return { ok: false, reason: "unreadable" }
  }

  return { ok: true, renditions }
}
