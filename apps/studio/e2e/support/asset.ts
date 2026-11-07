import { randomUUID } from "node:crypto"

import { prisma } from "@checkout-studio/database"

/**
 * An asset in a project's library, without a storage service.
 *
 * Written as a row, as the page fixture writes a page: what these tests need
 * is a library with something in it, not a run of the upload pipeline. That
 * pipeline has its own tests against a real database, a real entitlement
 * cache and a store that keeps what it is given.
 *
 * The URL is a data URI, which is the part worth explaining. An asset with no
 * renditions falls back to its master for the thumbnail, and the master is
 * this column — so the browser draws the picture from the bytes in this file
 * and the test needs no object storage, no bucket and no network. The one
 * thing it cannot cover is a URL that resolves through the CDN, which is not
 * what dragging is about.
 */

/** A square, drawn rather than fetched. */
const PICTURE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
      '<rect width="64" height="64" fill="rebeccapurple"/>' +
      "</svg>",
  )

export interface AssetFixture {
  id: string
  fileName: string
  /** What an `<img>` on the canvas will have as its `src`. */
  url: string
}

export async function createAsset(projectId: string, fileName = "hero.png"): Promise<AssetFixture> {
  const suffix = randomUUID().replace(/-/g, "")

  const row = await prisma.asset.create({
    data: {
      projectId,
      fileName,
      mimeType: "image/png",
      sizeBytes: 1_024,
      width: 64,
      height: 64,
      storageKey: `assets/${suffix}.png`,
      url: PICTURE,
      // The content hash is 64 characters and unique per project. Nothing here
      // hashes anything, so the id stands in for it.
      sha256: suffix.padEnd(64, "0").slice(0, 64),
    },
    select: { id: true },
  })

  return { id: row.id, fileName, url: PICTURE }
}
