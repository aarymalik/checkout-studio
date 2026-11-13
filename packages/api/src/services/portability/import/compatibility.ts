import "server-only"

import { compareVersions } from "@checkout-studio/schema"

import type { BundleManifest, PluginRequirement } from "../types"
import { satisfies } from "./versions"

/**
 * Whether this installation can take the bundle, and what it will cost.
 *
 * Step 5 of docs/export-import.md § Import Workflow, which gives the four
 * answers outright:
 *
 *     schemaVersion   > supported → reject
 *     schemaVersion   < current   → queue migration
 *     rendererVersion unsatisfied → warn, allow with degradation
 *     missing plugins             → report, offer substitution
 *
 * Only the first refuses, and the asymmetry is the design. A document written
 * against a newer schema cannot be read by the thing that would migrate it,
 * so there is nothing to do but stop. Everything else is a page that will
 * import and render imperfectly, and a merchant who can see what is missing
 * is better served than one handed a refusal.
 *
 * ## It decides, it does not act
 *
 * A migration is reported as needed rather than run, and a missing plugin is
 * reported rather than substituted. Both happen later in the workflow — steps
 * 7 and 6 — and a gate that performed them would be a gate nobody could ask
 * "what would happen if I imported this".
 *
 * ## A range it cannot read is a warning, never a pass
 *
 * A bundle from somebody else's implementation may ask for a range this build
 * does not understand. Treating that as satisfied installs something that may
 * not render; treating it as a refusal rejects a bundle that is probably
 * fine. It is reported, and the person decides.
 */

export interface Installation {
  /** The schema version this build reads and migrates towards. */
  schemaVersion: string
  /** This build's renderer, checked against the range the bundle asks for. */
  rendererVersion: string
  /** Plugin id to the version installed here. */
  plugins: ReadonlyMap<string, string>
}

/** A document older than this build, to be migrated before anything is written. */
export interface MigrationNeed {
  from: string
  to: string
}

export type CompatibilityWarning =
  /** This renderer is outside the range the bundle asks for. */
  | { code: "renderer-unsatisfied"; required: string; installed: string }
  /** The bundle names a range this build cannot read. */
  | { code: "renderer-unreadable"; required: string }
  | { code: "plugin-missing"; id: string; required: string; optional: boolean }
  | { code: "plugin-unsatisfied"; id: string; required: string; installed: string }
  | { code: "plugin-unreadable"; id: string; required: string }

export type Compatibility =
  | { ok: true; migrate: MigrationNeed | null; warnings: CompatibilityWarning[] }
  /**
   * Written against a schema this build does not know.
   *
   * The only refusal here, and it is absolute: the thing that would migrate
   * the document is the thing that cannot read it.
   */
  | { ok: false; reason: "schema-too-new"; required: string; supported: string }

export function checkCompatibility(
  manifest: BundleManifest,
  installation: Installation,
): Compatibility {
  const required = manifest.requires.schemaVersion
  const age = compareVersions(required, installation.schemaVersion)

  if (age > 0) {
    return { ok: false, reason: "schema-too-new", required, supported: installation.schemaVersion }
  }

  return {
    ok: true,
    migrate: age < 0 ? { from: required, to: installation.schemaVersion } : null,
    warnings: [
      ...rendererWarnings(manifest.requires.rendererVersion, installation.rendererVersion),
      ...manifest.requires.plugins.flatMap((plugin) => pluginWarnings(plugin, installation)),
    ],
  }
}

function rendererWarnings(required: string, installed: string): CompatibilityWarning[] {
  const verdict = satisfies(installed, required)

  if (verdict === "satisfied") return []
  if (verdict === "unreadable") return [{ code: "renderer-unreadable", required }]

  return [{ code: "renderer-unsatisfied", required, installed }]
}

function pluginWarnings(
  plugin: PluginRequirement,
  installation: Installation,
): CompatibilityWarning[] {
  const installed = installation.plugins.get(plugin.id)

  if (installed === undefined) {
    return [
      {
        code: "plugin-missing",
        id: plugin.id,
        required: plugin.version,
        optional: plugin.optional,
      },
    ]
  }

  const verdict = satisfies(installed, plugin.version)

  if (verdict === "satisfied") return []
  if (verdict === "unreadable") {
    return [{ code: "plugin-unreadable", id: plugin.id, required: plugin.version }]
  }

  return [{ code: "plugin-unsatisfied", id: plugin.id, required: plugin.version, installed }]
}
