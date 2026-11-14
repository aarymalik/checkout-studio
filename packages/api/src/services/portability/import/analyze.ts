import "server-only"

import type { AssetRegistryEntry } from "../export/registry"
import type { BundleManifest } from "../types"
import type { Compatibility, CompatibilityWarning } from "./compatibility"
import { reconcileAssets, reconcilePage } from "./reconcile"
import type { TargetProject } from "./reconcile"
import type {
  ImportAction,
  ImportBlocker,
  ImportConflict,
  ImportEstimate,
  ImportTarget,
  ImportWarning,
  ThemeStrategy,
} from "./plan"

/**
 * What an import would do, before it does any of it.
 *
 * docs/export-import.md § Import Plan opens with the requirement rather than
 * a type: "users must be able to see exactly what an import will do before it
 * happens." Everything here is in service of that sentence — the plan is the
 * screen somebody approves, so it has to be complete, honest about what it
 * does not know, and produced without touching anything.
 *
 * ## A blocked import plans nothing
 *
 * When the compatibility gate refuses, the plan carries the blocker and no
 * actions. Listing work that cannot be carried out would describe an import
 * nobody can have, and the estimate beside it would be a duration for
 * something that will never run.
 *
 * ## A theme that will be ignored is a warning, not an action
 *
 * `keep-target` is the default for a page arriving in an existing project,
 * and it is the right default — the page adopts the project's theme, which is
 * what makes it look like it belongs. But a bundle carrying a theme that will
 * be discarded is exactly what the spec means by "anything that will silently
 * degrade", so it is said rather than left to be discovered.
 */

export interface AnalysisInput {
  manifest: BundleManifest
  /** The bundle's asset registry. */
  assets: readonly AssetRegistryEntry[]
  page: { name: string; slug: string }
  target: ImportTarget
  /** The rows the project already holds. */
  project: TargetProject
  compatibility: Compatibility
  themeStrategy: ThemeStrategy
}

export interface ImportPlan {
  bundle: BundleManifest
  target: ImportTarget
  /** Ordered actions the import will perform. */
  actions: ImportAction[]
  /** Anything requiring a decision. */
  conflicts: ImportConflict[]
  /** Anything that will silently degrade. */
  warnings: ImportWarning[]
  /** Anything that makes the import impossible. */
  blockers: ImportBlocker[]
  estimate: ImportEstimate
}

export function analyzeImport(input: AnalysisInput): ImportPlan {
  const base = { bundle: input.manifest, target: input.target }

  if (!input.compatibility.ok) {
    return {
      ...base,
      actions: [],
      conflicts: [],
      warnings: [],
      blockers: [
        {
          code: "schema-too-new",
          message: `This bundle was made with a newer version of Checkout Studio (schema ${input.compatibility.required}; this one reads ${input.compatibility.supported}).`,
          remediation: "Update Checkout Studio, then import it again.",
        },
      ],
      estimate: { pages: 0, nodes: 0, assets: 0, assetBytes: 0, durationMs: 0 },
    }
  }

  const page = reconcilePage(input.page.slug, input.page.name, input.project)
  const assets = reconcileAssets(input.assets, input.project)
  const theme = themeActions(input.manifest, input.themeStrategy)

  const actions: ImportAction[] = [
    ...migrationActions(input.compatibility),
    ...page.actions,
    ...theme.actions,
    ...assets.actions,
  ]

  return {
    ...base,
    actions,
    conflicts: [...page.conflicts, ...assets.conflicts],
    warnings: [...input.compatibility.warnings.map(described), ...theme.warnings],
    blockers: [],
    estimate: estimateFor(input.manifest, actions),
  }
}

function migrationActions(compatibility: Compatibility & { ok: true }): ImportAction[] {
  const { migrate } = compatibility

  return migrate === null ? [] : [{ type: "migrate-schema", from: migrate.from, to: migrate.to }]
}

function themeActions(
  manifest: BundleManifest,
  strategy: ThemeStrategy,
): { actions: ImportAction[]; warnings: ImportWarning[] } {
  if (strategy !== "keep-target")
    return { actions: [{ type: "merge-theme", strategy }], warnings: [] }

  if (!manifest.contents.theme) return { actions: [], warnings: [] }

  return {
    actions: [],
    warnings: [
      {
        code: "theme-not-applied",
        message:
          "This bundle carries a theme. It will be ignored, and the pages will use this project's theme.",
      },
    ],
  }
}

/** One allowance for the transaction, and the bytes that have to cross a network. */
const BASE_MS = 500

/**
 * A deliberately pessimistic upload rate, in bytes per millisecond.
 *
 * 1 MB/s. The estimate's only job is to tell somebody whether to wait or to
 * go and do something else, and the honest state of this number is that it
 * is a guess: nothing has measured an import yet. It is a named constant so
 * that the first measurement replaces it rather than argues with it.
 */
const BYTES_PER_MS = 1_000

function estimateFor(manifest: BundleManifest, actions: readonly ImportAction[]): ImportEstimate {
  /*
   * Only what is uploaded. A reused asset is a row pointing at bytes that are
   * already here, which costs nothing to transfer and should not appear in a
   * number somebody is reading as "how long will this take".
   */
  const assetBytes = actions.reduce(
    (total, action) => (action.type === "upload-asset" ? total + action.bytes : total),
    0,
  )

  return {
    pages: manifest.contents.pages.length,
    nodes: manifest.contents.totalNodes,
    assets: manifest.contents.assets,
    assetBytes,
    durationMs: BASE_MS + Math.ceil(assetBytes / BYTES_PER_MS),
  }
}

/** A structured warning, in words for the person deciding. */
function described(warning: CompatibilityWarning): ImportWarning {
  switch (warning.code) {
    case "renderer-unsatisfied":
      return {
        code: warning.code,
        message: `This bundle expects renderer ${warning.required}; this one is ${warning.installed}. Parts of the page may not render as they did.`,
      }
    case "renderer-unreadable":
      return {
        code: warning.code,
        message: `This bundle expects renderer ${warning.required}, which this version cannot interpret. It may not render as it did.`,
      }
    case "plugin-missing":
      return {
        code: warning.code,
        message: warning.optional
          ? `The optional plugin ${warning.id} is not installed. Anything using it will be left out.`
          : `The plugin ${warning.id} is not installed. Its components will not render until it is.`,
      }
    case "plugin-unsatisfied":
      return {
        code: warning.code,
        message: `${warning.id} ${warning.installed} is installed; this bundle expects ${warning.required}.`,
      }
    case "plugin-unreadable":
      return {
        code: warning.code,
        message: `This bundle expects ${warning.id} ${warning.required}, which this version cannot interpret.`,
      }
  }
}
