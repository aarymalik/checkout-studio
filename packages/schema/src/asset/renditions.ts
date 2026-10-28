import { z } from "zod"

/**
 * The sizes and formats an image is served at.
 *
 * Here rather than beside the code that writes them, because they are a
 * contract and not a setting. The builder records which of them an asset has,
 * the renderer writes a `srcset` and a `<source type>` from that record, and
 * the service in `@checkout-studio/api` produces the files — three sides that
 * have to agree, in the one package all three may read.
 *
 * Changing a width is therefore a schema change: every asset already stored
 * describes files at the old widths, and a published page asks for them by
 * name. See docs/performance.md § Asset Optimization.
 */

/** Narrowest first, which is also the order a `srcset` wants them in. */
export const RENDITION_SIZES = ["thumbnail", "medium", "large"] as const

export type RenditionSize = (typeof RENDITION_SIZES)[number]

export const RENDITION_FORMATS = ["webp", "avif"] as const

export type RenditionFormat = (typeof RENDITION_FORMATS)[number]

/**
 * The widths, in CSS pixels times two.
 *
 * A thumbnail fills a library grid cell or an inline icon on a retina screen.
 * Medium covers a content column, and a hero on a phone. Large covers a
 * full-width hero on a desktop.
 */
export const RENDITION_WIDTHS: Readonly<Record<RenditionSize, number>> = {
  thumbnail: 320,
  medium: 960,
  large: 1920,
}

export const RENDITION_MIME_TYPES: Readonly<Record<RenditionFormat, string>> = {
  webp: "image/webp",
  avif: "image/avif",
}

/**
 * One rendition, as it is recorded against an asset.
 *
 * Which renditions exist cannot be worked out from the master alone — a logo
 * narrower than a thumbnail has none, and an animated one has no AVIF — so the
 * set is recorded rather than inferred. What is *not* recorded is where the
 * file is: a rendition's storage key is a function of the asset's content hash
 * and these two names, so there is no path here to drift from the one the
 * bytes were written to.
 *
 * The dimensions are, because a `srcset` entry and an `<img>` are both written
 * from them and guessing would be a layout shift on a page taking card
 * details.
 */
export const assetRendition = z
  .object({
    size: z.enum(RENDITION_SIZES),
    format: z.enum(RENDITION_FORMATS),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sizeBytes: z.number().int().positive(),
  })
  .strict()

export type AssetRendition = z.infer<typeof assetRendition>

/**
 * Every rendition an asset has.
 *
 * Strict and validated on read-back, because this is a JSON column: nothing in
 * the database checks its shape, so a row written by an older release is a
 * shape this one has to notice rather than trust.
 */
export const assetRenditions = z.array(assetRendition)
