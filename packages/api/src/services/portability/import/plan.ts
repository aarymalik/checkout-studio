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
 */

export type ImportAction =
  | { type: "create-page"; name: string }
  | { type: "merge-theme"; strategy: ThemeStrategy }
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

export type ThemeStrategy =
  /** Ignore the bundle's theme. The page adopts the project's, and looks like it belongs. */
  | "keep-target"
  /** Overwrite the project's theme with the bundle's. */
  | "apply-bundle"
  /** Add the tokens the project does not have, and change none that it does. */
  | "merge-additive"
  /** Import it as a separate, selectable theme. */
  | "namespace"

export interface ImportWarning {
  code: string
  /** Written for the person deciding. */
  message: string
  nodeIds?: string[]
}

export interface ImportBlocker {
  code: string
  message: string
  /** What the person can do about it. A blocker without one is a dead end. */
  remediation: string
}

export interface ImportTarget {
  projectId: string
  /** Where imported pages land. */
  mode: "new-project" | "into-project" | "into-page"
  pageId?: string
}

export interface ImportEstimate {
  pages: number
  nodes: number
  assets: number
  /** Bytes that will actually be transferred. A reused asset costs none. */
  assetBytes: number
  durationMs: number
}
