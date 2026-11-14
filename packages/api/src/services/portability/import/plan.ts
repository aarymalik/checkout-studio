import "server-only"

/**
 * The vocabulary of an import plan.
 *
 * Taken from docs/export-import.md § Import Plan rather than invented here,
 * for the reason the bundle's own types give: the plan is what a person is
 * shown before they agree to anything, and "users must be able to see exactly
 * what an import will do before it happens" is a promise about these names as
 * much as about the mechanism.
 *
 * Only the part that is produced today. The rest of the plan — the estimate,
 * the theme strategy, the blockers — arrives with the stage that assembles it.
 */

export type ImportAction =
  | { type: "create-page"; name: string }
  | { type: "upload-asset"; fileName: string; bytes: number }
  /** Already here, byte for byte. Nothing is uploaded and nothing is duplicated. */
  | { type: "reuse-asset"; assetId: string; reason: "identical-hash" }
  | { type: "migrate-schema"; from: string; to: string }

export type ConflictResolution = "rename" | "replace" | "keep-both" | "skip"

export interface ImportConflict {
  kind: "duplicate-page-slug" | "asset-name-collision"
  /** Written for the person deciding, not for a log. */
  description: string
  options: ConflictResolution[]
  recommended: ConflictResolution
}
