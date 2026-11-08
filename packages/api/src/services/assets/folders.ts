import "server-only"

import { assetRepository, type TenantContext } from "@checkout-studio/database"

/**
 * Filing an asset under a folder.
 *
 * ## A folder is a name, not a row
 *
 * There is no folder table and nothing to create first: a folder exists
 * because assets carry its name, and stops existing when the last one leaves.
 * That is what somebody who emptied a folder meant, and it means the two can
 * never disagree about which folders there are.
 *
 * ## Flat
 *
 * No separator, no nesting. A tree is something to draw, move within, and
 * keep from looping, and nobody has asked for one — whereas a flat list can
 * grow a tree later and a tree cannot be taken back.
 */

/** As long as a name can be and still fit in a panel 280 pixels wide. */
export const FOLDER_NAME_MAXIMUM = 60

export type FolderResult =
  | { ok: true; folder: string | null }
  | { ok: false; reason: "not-found" }
  /** Empty after trimming, too long, or carrying a separator. */
  | { ok: false; reason: "invalid"; message: string }

/**
 * Puts an asset in a folder, or takes it out of one.
 *
 * Null is unfiled. A name is trimmed and its inner runs of whitespace
 * collapsed, because "Spring  sale" and "Spring sale" are one folder to
 * everybody except a string comparison.
 *
 * And if the project already has a folder whose name differs only in case,
 * that spelling wins. Two folders called "spring sale" and "Spring Sale" is
 * the kind of thing nobody means to make and everybody then has to tidy.
 */
export async function fileAsset(
  tenant: TenantContext,
  assetId: string,
  folder: string | null,
): Promise<FolderResult> {
  const named = folder === null ? null : clean(folder)

  if (named !== null && !named.ok) return named

  const existing = named === null ? null : await spellingOf(tenant, named.name)
  const moved = await assetRepository.setFolder(tenant, assetId, existing)

  return moved ? { ok: true, folder: existing } : { ok: false, reason: "not-found" }
}

/** Every folder this project has, which is the names its assets carry. */
export async function foldersOf(tenant: TenantContext): Promise<readonly string[]> {
  const named = (await assetRepository.list(tenant))
    .map((asset) => asset.folder)
    .filter((folder): folder is string => folder !== null)

  return [...new Set(named)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
}

type Cleaned = { ok: true; name: string } | { ok: false; reason: "invalid"; message: string }

function clean(folder: string): Cleaned {
  const name = folder.trim().replace(/\s+/g, " ")

  if (name === "") return invalid("A folder needs a name.")

  if (name.length > FOLDER_NAME_MAXIMUM) {
    return invalid(`A folder's name is at most ${String(FOLDER_NAME_MAXIMUM)} characters.`)
  }

  /*
   * No separator. Not because one would break anything — the name is a column
   * and never a path — but because typing "Spring/Banners" means something to
   * the person typing it, and what they would get is a flat folder with a
   * slash in its name.
   */
  if (name.includes("/") || name.includes("\\")) {
    return invalid("Folders do not nest, so a name cannot contain a slash.")
  }

  return { ok: true, name }
}

function invalid(message: string): Cleaned {
  return { ok: false, reason: "invalid", message }
}

/** The spelling this project already uses for a name, or the one given. */
async function spellingOf(tenant: TenantContext, name: string): Promise<string> {
  const folders = await foldersOf(tenant)

  return folders.find((folder) => folder.toLowerCase() === name.toLowerCase()) ?? name
}
