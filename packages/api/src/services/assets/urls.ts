import "server-only"

import type { StoredAsset } from "@checkout-studio/database"
import type { AssetUrls } from "@checkout-studio/plugin-sdk"

import { publicUrl, renditionKey } from "./keys"

/**
 * An asset reference, turned into the URLs a page actually fetches.
 *
 * This is where the renditions stop being files and start being a `srcset`.
 * The renderer declares `resolveAsset` as the seam for it and defaults it to
 * answering nothing, which is what every asset reference resolved to before
 * this existed.
 *
 * It lives here rather than in the renderer because it reads an asset row, and
 * the renderer must never depend on server code — a published checkout ships
 * without a byte of it. An application builds the resolver and hands it in,
 * which is the arrangement the seam was shaped for.
 *
 * It takes the base a browser fetches from rather than the object store. The
 * store's other two operations need credentials and this needs none, and the
 * published checkout — which is the main caller — holds as few of those as it
 * can: every one is a credential exposed on the path that handles payments.
 *
 * See docs/performance.md § Asset Optimization and docs/architecture.md.
 */

/**
 * The widths offered, and how wide the image will be shown.
 *
 * ## Why `sizes` is not optional
 *
 * A `srcset` with width descriptors is a list of candidates; `sizes` is how the
 * browser decides which. Without it the default is `100vw` — so an image
 * displayed in a 400px column on a wide screen is told it covers the viewport,
 * and fetches the 1920. The renditions would exist and the largest would always
 * win, which is worse than having none: the same bytes, plus five extra files.
 *
 * ## What we can honestly say
 *
 * Not the display width: that is a style, and it changes per breakpoint. What
 * is true of every layout is that an image is not usefully shown wider than it
 * is — past its intrinsic width it is being upscaled. So `sizes` says: up to
 * that width, assume the image may fill the viewport; beyond it, it is capped.
 *
 * That is a ceiling rather than a measurement, and it is honest about being
 * one. It stops the 1920 being fetched for a 600-pixel asset, which is the
 * common case. An image in a narrow column on a wide screen still over-fetches
 * by a step, and fixing that needs the layout — which belongs to a later phase
 * where a component can declare how wide it expects to be.
 */
function sizesFor(width: number): string {
  return `(max-width: ${width}px) 100vw, ${width}px`
}

/**
 * The candidates a browser may choose from, widest last.
 *
 * Only the renditions, and only in the format they were written in. The master
 * is the `src` — the fallback for a browser that reads no `srcset` at all —
 * rather than a candidate, because it is a JPEG or a PNG where every candidate
 * is WebP or AVIF, and mixing formats in one `srcset` offers a browser a choice
 * it cannot make on merit: it picks by width, so a browser that supports AVIF
 * would take a wider JPEG over a narrower AVIF.
 *
 * Picking *between* formats is `<picture>`'s job, and a component that wants it
 * can have it once one asks. One format per `srcset` is the part that is right
 * either way.
 */
function srcSetFor(asset: StoredAsset, base: string): string | undefined {
  /*
   * AVIF where there is any, WebP otherwise. Not both: see above. AVIF is
   * roughly half the bytes at the same quality, and every browser that cannot
   * read it falls back to the master through `src`.
   */
  const format = asset.renditions.some((one) => one.format === "avif") ? "avif" : "webp"
  const candidates = asset.renditions
    .filter((one) => one.format === format)
    .sort((a, b) => a.width - b.width)
    .map(
      (one) => `${publicUrl(base, renditionKey(asset.sha256, one.size, one.format))} ${one.width}w`,
    )

  return candidates.length === 0 ? undefined : candidates.join(", ")
}

/**
 * The URLs for one stored asset.
 *
 * `src` is always the master, so a page works for a browser that reads no
 * `srcset` and for an asset that earned no renditions — which is any asset
 * narrower than a thumbnail, and every font, video and PDF.
 */
export function assetUrls(asset: StoredAsset, base: string): AssetUrls {
  const srcSet = srcSetFor(asset, base)

  return {
    src: asset.url,
    ...(srcSet === undefined ? {} : { srcSet }),
    ...(asset.width === null ? {} : { width: asset.width }),
    ...(asset.height === null ? {} : { height: asset.height }),
    ...(srcSet === undefined || asset.width === null ? {} : { sizes: sizesFor(asset.width) }),
  }
}

/**
 * The URLs for a set of assets, keyed by id.
 *
 * The lookup `assetResolver` closes over. A plain object rather than a Map
 * because it is built once and only read, and because an object is a shape
 * that could cross to a client component if one ever needed the whole set.
 */
export function assetUrlMap(
  assets: readonly StoredAsset[],
  base: string,
): Record<string, AssetUrls> {
  const urls: Record<string, AssetUrls> = {}

  for (const asset of assets) urls[asset.id] = assetUrls(asset, base)

  return urls
}

/**
 * A resolver over the assets a page refers to.
 *
 * Built from a list rather than from a query, so the lookup is in hand before
 * rendering starts. The renderer walks a tree synchronously — it has to, to be
 * a server component that ships no JavaScript — so an asset that had to be
 * fetched mid-walk could not be.
 *
 * An id that is not in the list resolves to nothing, and the renderer reports
 * it as `asset-missing`. That is the honest answer for an asset deleted after a
 * page referenced it, and it is why resolution does not throw: one missing logo
 * should not take down a checkout.
 *
 * For the published page, which renders in the same process that built this.
 * The Studio's editor is handed the assets themselves instead, because its
 * inspector has to list them as well as resolve them.
 */
export function assetResolver(
  assets: readonly StoredAsset[],
  base: string,
): (assetId: string) => AssetUrls | null {
  const urls = assetUrlMap(assets, base)

  return (assetId) => urls[assetId] ?? null
}
