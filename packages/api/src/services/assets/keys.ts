import { RENDITION_WIDTHS } from "@checkout-studio/schema"
import type { RenditionFormat, RenditionSize } from "@checkout-studio/schema"

/**
 * Where an asset's files live, as a function of what they contain.
 *
 * ## The content hash, not the filename
 *
 * A merchant's filename is a label — `inspectUpload` refuses one that is a
 * path, and never rewrites one — so it is shown to people and never used to
 * decide where bytes go. The key comes from the sha256 of the stored file
 * instead, which makes it the one thing it has to be: the same for identical
 * content and different for everything else.
 *
 * That is what makes deduplication work at the storage layer as well as in the
 * database. Two projects uploading the same stock photograph write the same
 * key, and the second write is the same bytes landing on themselves.
 *
 * ## Derived, never stored
 *
 * No key is recorded against a rendition. The asset row records which
 * renditions exist, and these functions say where each one is — so there is no
 * copy of a path to drift from the place the bytes were actually written, and
 * nothing to migrate if the layout ever changes.
 *
 * Nothing here knows about a storage provider. These are keys inside a bucket
 * or paths inside a directory, and the URL an asset is served from is a
 * separate thing recorded on the row.
 */

const PREFIX = "assets"

/**
 * The master's key.
 *
 * Flat, and named by the extension the signature matched rather than by the
 * uploaded name's. A key is served with the media type from the asset row, so
 * the extension here is for the convenience of anyone looking in a bucket.
 */
export function masterKey(sha256: string, extension: string): string {
  return `${PREFIX}/${sha256}.${extension}`
}

/**
 * A rendition's key, under its master's hash.
 *
 * The width is in the name as well as the size, so a file found on its own
 * says what it is. The size name alone would need this table to read, and the
 * width alone would make changing one silently point at the old file.
 */
export function renditionKey(sha256: string, size: RenditionSize, format: RenditionFormat): string {
  return `${PREFIX}/${sha256}/${size}-${RENDITION_WIDTHS[size]}.${format}`
}
