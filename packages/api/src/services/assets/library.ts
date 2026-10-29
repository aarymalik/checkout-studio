import "server-only"

import { RENDITION_SIZES } from "@checkout-studio/schema"
import type { StoredAsset } from "@checkout-studio/database"

import { renditionKey } from "./keys"
import type { ObjectStore } from "./store"

/**
 * An asset as the media library needs it.
 *
 * The library runs in the browser, and everything that turns an asset into
 * URLs — the key functions, the store's configuration — is server code. So the
 * projection happens here, once, and what crosses to the client is a shape
 * with no behaviour in it.
 *
 * It is a projection and not the row: `storageKey` and `sha256` are how we
 * find a file, which is nothing a grid of thumbnails needs to know.
 */

export interface LibraryAsset {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  /** The master, which is what a merchant copies and what a page links to. */
  url: string
  /**
   * The smallest rendition there is, or the master when there is none.
   *
   * A grid cell is a couple of hundred pixels wide, and the master may be
   * four thousand. Falling back to it is right rather than regrettable: an
   * asset with no renditions is one already small enough to have earned none.
   */
  thumbnailUrl: string
  /** ISO 8601, because what crosses to the client is JSON. */
  createdAt: string
}

export function libraryAsset(asset: StoredAsset, store: ObjectStore): LibraryAsset {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    url: asset.url,
    thumbnailUrl: thumbnailUrl(asset, store),
    createdAt: asset.createdAt.toISOString(),
  }
}

function thumbnailUrl(asset: StoredAsset, store: ObjectStore): string {
  /*
   * The narrowest size this asset actually has, in `RENDITION_SIZES` order —
   * which is narrowest first, so the first match is the smallest file. Not the
   * smallest `sizeBytes`: a thumbnail of a flat colour can be larger than a
   * medium of one, and what a grid wants is the fewest pixels it can get.
   */
  for (const size of RENDITION_SIZES) {
    const found = asset.renditions.find((rendition) => rendition.size === size)

    if (found !== undefined) return store.url(renditionKey(asset.sha256, size, found.format))
  }

  return asset.url
}
