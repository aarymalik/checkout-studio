import "server-only"

import type { StoredAsset } from "@checkout-studio/database"

import type { AssetRegistryEntry } from "../export/registry"
import type { ImportAction, ImportConflict } from "./plan"

/**
 * What an import would do about what is already here.
 *
 * Two questions, both answered against the target project rather than against
 * the bundle: which of these files does this project already hold, and does
 * anything it holds already answer to the same name.
 *
 * Pure, and given the project's rows rather than reading them. The stage that
 * knows whose project it is should be the one querying it, and an analyzer
 * that fetched its own rows could not be asked "what would this bundle do to
 * that project" without being that project.
 *
 * ## Assets are matched on content
 *
 * docs/export-import.md is explicit: "Assets are matched on import by
 * `sha256`, not by filename. Identical bytes are never stored twice." So the
 * same logo arriving in six templates is one upload and five reuses, and a
 * file whose name happens to match something already here is still a
 * different file.
 *
 * A name that collides without the bytes matching is reported as a conflict
 * rather than resolved. Both files are real and both are wanted; which name
 * each ends up with is a decision, and the recommendation is to keep both
 * because an import that silently replaced a picture would be the worst of
 * the four options.
 *
 * ## A slug is the one thing that cannot simply be duplicated
 *
 * Two pages may share a title. They may not share a live URL — the partial
 * unique index sees to that — so a slug already in use is a decision before
 * the import can proceed, and renaming is recommended because it is the only
 * resolution that keeps both pages reachable.
 */

export interface TargetProject {
  /** Every asset the project holds, for matching on content hash. */
  assets: readonly StoredAsset[]
  /** The slugs a new page must avoid: the live ones. */
  slugsInUse: readonly string[]
}

export interface Reconciliation {
  /** In the order the plan will perform them. */
  actions: ImportAction[]
  conflicts: ImportConflict[]
}

export function reconcileAssets(
  entries: readonly AssetRegistryEntry[],
  target: TargetProject,
): Reconciliation {
  const byHash = new Map(target.assets.map((asset) => [asset.sha256, asset]))
  const byName = new Map(target.assets.map((asset) => [asset.fileName, asset]))

  const actions: ImportAction[] = []
  const conflicts: ImportConflict[] = []

  for (const entry of entries) {
    const identical = byHash.get(entry.sha256)

    if (identical !== undefined) {
      actions.push({ type: "reuse-asset", assetId: identical.id, reason: "identical-hash" })

      continue
    }

    actions.push({ type: "upload-asset", fileName: entry.fileName, bytes: entry.bytes })

    /*
     * Only once the bytes are known to differ. A file matching by name *and*
     * by hash is the same file arriving again, which is a reuse and not
     * something to ask anybody about.
     */
    if (byName.has(entry.fileName)) {
      conflicts.push({
        kind: "asset-name-collision",
        description: `This project already has a different file called ${entry.fileName}.`,
        options: ["keep-both", "rename", "replace", "skip"],
        recommended: "keep-both",
      })
    }
  }

  return { actions, conflicts }
}

export function reconcilePage(slug: string, name: string, target: TargetProject): Reconciliation {
  const taken = target.slugsInUse.includes(slug)

  return {
    actions: [{ type: "create-page", name }],
    conflicts: taken
      ? [
          {
            kind: "duplicate-page-slug",
            description: `This project already has a page at /${slug}.`,
            options: ["rename", "replace", "skip"],
            recommended: "rename",
          },
        ]
      : [],
  }
}
