import "server-only"

/**
 * What a bundle is.
 *
 * Taken from docs/export-import.md § Manifest rather than designed here: the
 * format is the contract between two installations that may be different
 * versions of this product, and a contract invented at the call site is a
 * contract only one side has read.
 *
 * ## The manifest is the part that has to be readable by a stranger
 *
 * An importer reads it before it trusts anything else in the file — before
 * the schema is parsed, before a node is looked at — to decide whether it can
 * proceed at all. So it carries its own format version, independent of the
 * schema's: a bundle written by a newer product is refused on the manifest,
 * not discovered halfway through a document.
 */

/** Never changes. A file that does not say this is not one of ours. */
export const BUNDLE_FORMAT = "checkout-studio/bundle"

/**
 * The bundle format's own version, independent of the schema's.
 *
 * Bumped when the *envelope* changes — a new manifest field, a different
 * checksum rule — which is a different question from whether the document
 * inside needs migrating.
 */
export const BUNDLE_FORMAT_VERSION = "1.0.0"

export type BundleKind =
  "project" | "page" | "section" | "symbol" | "template" | "theme" | "starter-kit" | "revision"

export interface BundleAuthor {
  /** Display name only. Never an email, never a user id. */
  name: string
  organization?: string
  url?: string
}

export interface PluginRequirement {
  id: string
  version: string
  optional: boolean
}

export interface FontRequirement {
  family: string
  weights: number[]
  /** "custom" fonts travel as assets; see theme-system.md. */
  source: "google" | "system" | "custom"
  assetId?: string
}

export interface BundleRequirements {
  /** Minimum schema version the bundle depends on. */
  schemaVersion: string
  /** Semver range the renderer must satisfy. */
  rendererVersion: string
  plugins: PluginRequirement[]
  fonts: FontRequirement[]
  /** Component types used anywhere in the bundle. */
  componentTypes: string[]
  /** Optional capabilities. Missing ones degrade, never fail. */
  optional?: string[]
}

export interface BundleContents {
  pages: string[]
  symbols: string[]
  sections: string[]
  theme: boolean
  settings: boolean
  assets: number
  totalNodes: number
  uncompressedBytes: number
}

export interface BundleManifest {
  format: typeof BUNDLE_FORMAT
  formatVersion: string
  kind: BundleKind
  /** Stable identifier, for deduplication and update detection. */
  bundleId: string
  name: string
  description?: string
  tags: string[]
  createdAt: string
  createdBy: BundleAuthor
  generator: { product: "checkout-studio"; version: string }
  requires: BundleRequirements
  contents: BundleContents
  /** Of the payload, never of itself. See `checksumOf`. */
  checksum: string
  signature?: string
}

/**
 * What the bundle carries, beside the manifest that describes it.
 *
 * Deliberately `unknown` at this layer. What a page bundle holds and what a
 * theme bundle holds are different shapes, and the envelope's job — carry it,
 * hash it, hand it back unchanged — is the same for both. The stage that
 * knows which kind it asked for is the stage that parses it.
 */
export type BundlePayload = Readonly<Record<string, unknown>>

export interface Bundle {
  manifest: BundleManifest
  payload: BundlePayload
}
