import "server-only"

import { RENDITION_SIZES } from "@checkout-studio/schema"
import type { StoredAsset } from "@checkout-studio/database"
import { kindForMimeType } from "@checkout-studio/utils"
import type { UploadKind } from "@checkout-studio/utils"

import { publicUrl, renditionKey } from "./keys"

/**
 * An asset as the media library needs it.
 *
 * The library runs in the browser, and turning an asset row into URLs is
 * server work. So the projection happens here, once, and what crosses to the
 * client is a shape with no behaviour in it.
 *
 * It is a projection and not the row: `storageKey` and `sha256` are how we
 * find a file, which is nothing a grid of thumbnails needs to know.
 */

export interface LibraryAsset {
  id: string
  fileName: string
  mimeType: string
  /**
   * The group this belongs to, for filtering by.
   *
   * Resolved here rather than in the browser, from the same table the
   * signatures are in, so a library's filter cannot disagree with the ceilings.
   * Null only for a stored type this release no longer permits, which is a row
   * from an older one rather than anything a merchant can make.
   */
  kind: UploadKind | null
  sizeBytes: number
  width: number | null
  height: number | null
  /** The folder it is filed under, or null for unfiled. */
  folder: string | null
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

export function libraryAsset(asset: StoredAsset, base: string): LibraryAsset {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    kind: kindForMimeType(asset.mimeType),
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    folder: asset.folder,
    url: asset.url,
    thumbnailUrl: thumbnailUrl(asset, base),
    createdAt: asset.createdAt.toISOString(),
  }
}

function thumbnailUrl(asset: StoredAsset, base: string): string {
  /*
   * The narrowest size this asset actually has, in `RENDITION_SIZES` order —
   * which is narrowest first, so the first match is the smallest file. Not the
   * smallest `sizeBytes`: a thumbnail of a flat colour can be larger than a
   * medium of one, and what a grid wants is the fewest pixels it can get.
   */
  for (const size of RENDITION_SIZES) {
    const found = asset.renditions.find((rendition) => rendition.size === size)

    if (found !== undefined) return publicUrl(base, renditionKey(asset.sha256, size, found.format))
  }

  return asset.url
}
