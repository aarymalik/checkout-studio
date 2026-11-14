import "server-only"

import type { ImportedAsset, StoredAsset, TenantContext } from "@checkout-studio/database"

import { acceptUpload } from "../../assets/accept"
import { masterKey } from "../../assets/keys"
import type { ObjectStore } from "../../assets/store"
import type { AssetRegistryEntry } from "../export/registry"
import { fetchAsset } from "./fetch"

/**
 * Bringing a bundle's files into this project.
 *
 * Step 11 of docs/export-import.md § Import Workflow. Two things happen per
 * asset and the order matters: the ones this project already holds are
 * recognised before anything is fetched, and the ones it does not go through
 * exactly the same door an upload does.
 *
 * ## The same sanitizer as an upload, or import is the way around it
 *
 * `acceptUpload` is what sniffs the signature, refuses what it does not
 * recognise, strips an SVG of everything that can execute and re-encodes an
 * image without its metadata. A second path into the asset library that did
 * any less would not be a shortcut; it would be the supported method of
 * getting a script onto a checkout page. So the bytes a bundle points at are
 * treated exactly like bytes somebody dragged in.
 *
 * ## The hash that is stored is not the hash that was declared
 *
 * `acceptUpload` re-encodes, so what lands is not what arrived, and its hash
 * is of what lands. The bundle's declared sha256 is used for the two things
 * it is good for — proving the fetch returned the right file, and spotting a
 * file this project already holds — and the row records the hash of the
 * bytes actually written.
 *
 * Those are usually the same number, because the exporting installation
 * stored its master through this same pipeline. Usually, not always: two
 * installations on different versions re-encode differently, and then a file
 * that could have been reused is uploaded again. A missed deduplication is
 * the right way for that to go wrong.
 *
 * ## Nothing here writes a row
 *
 * Descriptors come back and the transaction writes them, because an asset
 * row created out here would survive a rollback — and an orphaned row is a
 * picture in somebody's library that no page uses and nobody added. Bytes
 * are different: they are content-addressed, unreachable without the hash,
 * and adopted by the next upload of the same file.
 */

export interface RehydrationLimits {
  /** Refused past this, per asset. */
  maxBytes: number
  timeoutMs: number
}

export type RehydrationRefusal =
  /** A JSON bundle whose registry entry names no URL to fetch from. */
  | "no-source"
  /** The fetch itself was refused. See `fetch.ts` for the reasons. */
  | "unfetchable"
  /** The file is not one this product accepts, or did not survive sanitizing. */
  | "unacceptable"

export interface Rehydrated {
  /** Ready for the transaction to write. */
  assets: ImportedAsset[]
  uploaded: number
  reused: number
  /** Bytes that crossed a network. A reused asset costs none. */
  bytesTransferred: number
}

export type RehydrationResult =
  | { ok: true; rehydrated: Rehydrated }
  | {
      ok: false
      reason: RehydrationRefusal
      /** Which asset, in the bundle's own terms. */
      sourceId: string
      message: string
    }

export interface RehydrationInput {
  tenant: TenantContext
  entries: readonly AssetRegistryEntry[]
  /** Every asset the project holds, for recognising what it already has. */
  held: readonly StoredAsset[]
  store: ObjectStore
  limits: RehydrationLimits
  /** Injected so a test needs no network. */
  fetch?: typeof fetchAsset
}

export async function rehydrateAssets(input: RehydrationInput): Promise<RehydrationResult> {
  const byHash = new Map(input.held.map((asset) => [asset.sha256, asset]))
  const fetcher = input.fetch ?? fetchAsset

  const assets: ImportedAsset[] = []
  let uploaded = 0
  let reused = 0
  let bytesTransferred = 0

  for (const entry of input.entries) {
    const existing = byHash.get(entry.sha256)

    if (existing !== undefined) {
      /*
       * Already here, byte for byte. The descriptor points at the row that
       * holds them, so the transaction's upsert resolves to it rather than
       * writing a second copy.
       */
      assets.push(descriptorOf(entry.sourceId, existing))
      reused += 1

      continue
    }

    if (entry.url === undefined) {
      return {
        ok: false,
        reason: "no-source",
        sourceId: entry.sourceId,
        message: `${entry.fileName} is not in this bundle and the bundle does not say where it is.`,
      }
    }

    const fetched = await fetcher(entry.url, {
      expectedSha256: entry.sha256,
      maxBytes: input.limits.maxBytes,
      timeoutMs: input.limits.timeoutMs,
    })

    if (!fetched.ok) {
      return {
        ok: false,
        reason: "unfetchable",
        sourceId: entry.sourceId,
        message: `${entry.fileName}: ${fetched.message}`,
      }
    }

    bytesTransferred += fetched.asset.bytes.length

    const accepted = await acceptUpload({ bytes: fetched.asset.bytes, fileName: entry.fileName })

    if (!accepted.ok) {
      return {
        ok: false,
        reason: "unacceptable",
        sourceId: entry.sourceId,
        /*
         * The sanitizer answers with a code rather than a sentence, because
         * what to say about it depends on who is reading. Here it is a file
         * inside somebody else's bundle, so the file is named first.
         */
        message: `${entry.fileName} was refused: ${accepted.reason}.`,
      }
    }

    const key = masterKey(accepted.sha256, accepted.type.extension)

    await input.store.put({ key, bytes: accepted.bytes, contentType: accepted.type.mimeType })

    assets.push({
      sourceId: entry.sourceId,
      fileName: accepted.fileName,
      mimeType: accepted.type.mimeType,
      sizeBytes: accepted.sizeBytes,
      width: accepted.width,
      height: accepted.height,
      storageKey: key,
      url: input.store.url(key),
      // Of what was stored, which is not what arrived.
      sha256: accepted.sha256,
    })
    uploaded += 1
  }

  return { ok: true, rehydrated: { assets, uploaded, reused, bytesTransferred } }
}

/** An asset this project already holds, described for the transaction. */
function descriptorOf(sourceId: string, asset: StoredAsset): ImportedAsset {
  return {
    sourceId,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    storageKey: asset.storageKey,
    url: asset.url,
    sha256: asset.sha256,
  }
}
