import { compareVersions } from "@checkout-studio/schema"
import { z } from "zod"

import { PERMISSION_IDS, permission } from "./permissions"

/**
 * The plugin manifest.
 *
 * Every plugin declares who it is, what it needs, and which versions of the
 * engine and the schema it was written against. A plugin that does not fit is
 * disabled rather than activated and left to fail somewhere obscure — see
 * docs/plugin-api.md § Version Compatibility.
 */

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "Expected major.minor.patch")

/**
 * A plugin id doubles as the namespace of every component it registers: the
 * `checkout` plugin owns `checkout.*` and nothing else. That is what stops one
 * plugin quietly replacing another's components.
 */
export const pluginId = z.string().regex(/^[a-z][a-z0-9-]*$/, "Expected a lowercase kebab-case id")

export const pluginCategory = z.enum([
  "components",
  "checkout",
  "forms",
  "cms",
  "ai",
  "analytics",
  "integration",
  "theme",
])

export const pluginCompatibility = z
  .object({
    /** The oldest engine this plugin works with. */
    minEngineVersion: semver,
    /** The newest engine this plugin has been tested against. Absent means "no ceiling". */
    maxEngineVersion: semver.optional(),
    /** The document version its components author against. */
    schemaVersion: semver,
  })
  .strict()

export const pluginManifest = z
  .object({
    id: pluginId,
    name: z.string().min(1).max(200),
    version: semver,
    description: z.string().min(1).max(500),
    author: z.string().min(1).max(200),
    category: pluginCategory,
    compatibility: pluginCompatibility,
    /** One of each is the most any plugin can legitimately need. */
    permissions: z.array(permission).max(PERMISSION_IDS.length).default([]),
  })
  .strict()

export type PluginId = z.infer<typeof pluginId>
export type PluginCategory = z.infer<typeof pluginCategory>
export type PluginCompatibility = z.infer<typeof pluginCompatibility>
export type PluginManifest = z.infer<typeof pluginManifest>

export interface EngineVersions {
  /** The running engine's version. */
  engine: string
  /** The document version the engine reads and writes. */
  schema: string
}

export type IncompatibilityReason =
  /** The engine is older than the plugin's floor. */
  | "engine-too-old"
  /** The engine is newer than the plugin was tested against. */
  | "engine-too-new"
  /** The plugin authors against a different major document version. */
  | "schema-mismatch"

export type CompatibilityResult =
  { compatible: true } | { compatible: false; reason: IncompatibilityReason; message: string }

/**
 * Whether a plugin may run here.
 *
 * The schema check is on the major version only. A plugin written against
 * `1.0.0` keeps working on `1.4.0`, because the migrations that got the document
 * there are additive by construction; a plugin written against `2.x` does not,
 * because a major bump is precisely the promise that something moved.
 */
export function isCompatible(
  manifest: PluginManifest,
  versions: EngineVersions,
): CompatibilityResult {
  const { compatibility } = manifest

  if (compareVersions(versions.engine, compatibility.minEngineVersion) < 0) {
    return {
      compatible: false,
      reason: "engine-too-old",
      message: `${manifest.name} needs Checkout Studio ${compatibility.minEngineVersion} or newer.`,
    }
  }

  if (
    compatibility.maxEngineVersion !== undefined &&
    compareVersions(versions.engine, compatibility.maxEngineVersion) > 0
  ) {
    return {
      compatible: false,
      reason: "engine-too-new",
      message: `${manifest.name} has not been tested past Checkout Studio ${compatibility.maxEngineVersion}.`,
    }
  }

  if (majorOf(versions.schema) !== majorOf(compatibility.schemaVersion)) {
    return {
      compatible: false,
      reason: "schema-mismatch",
      message: `${manifest.name} was written for schema ${compatibility.schemaVersion}, and this document is ${versions.schema}.`,
    }
  }

  return { compatible: true }
}

/** The major component of a version already validated as `major.minor.patch`. */
function majorOf(version: string): string {
  return version.slice(0, version.indexOf("."))
}
