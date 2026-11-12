import "server-only"

import { canonicalText } from "@checkout-studio/schema"
import { contentHash } from "@checkout-studio/utils"
import type { CheckoutSchema, CheckoutTheme } from "@checkout-studio/schema"

import { checksumOf } from "../checksum"
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from "../types"
import type { BundleAuthor, BundleManifest, BundlePayload, PluginRequirement } from "../types"
import { documentReferences } from "./collect"
import { fontRequirements } from "./fonts"
import type { AssetRegistryEntry } from "./registry"

/**
 * The manifest for a page bundle.
 *
 * Steps 8 and 10 of docs/export-import.md § Export Workflow — compute the
 * contents summary and the requirements, then the checksum. It is the part an
 * importer reads before it trusts anything else in the file, so everything in
 * it is derived from what actually travels rather than asserted beside it. A
 * summary that can disagree with the thing it summarises is worse than no
 * summary.
 *
 * ## The bundle id is derived, and carries nothing
 *
 * "Stable identifier, for deduplication and update detection" — so the same
 * page exported twice has to produce the same id, which rules out a random
 * one. It is a hash of the project and page ids, which makes it stable and
 * unique without the ids themselves going anywhere: the manifest ends up
 * holding a number that identifies the bundle and says nothing about the
 * tenant, which is the same reason redaction blanks those fields rather than
 * carrying them.
 *
 * Domain-separated, so the same page exported as a different kind of bundle
 * is a different bundle rather than a collision.
 *
 * ## A page bundle carries no symbols and no sections
 *
 * Not yet-to-be-done: that is what the kind means. A page bundle holds one
 * page. A section bundle holds a subtree, and it is a different kind with a
 * different builder.
 */

export interface PageManifestInput {
  /** Redacted, and exactly what will travel. */
  payload: BundlePayload
  /** The redacted document inside that payload, for the walks. */
  document: CheckoutSchema
  theme: CheckoutTheme
  /** Hashed into the bundle id. Never stored. */
  source: { projectId: string; pageId: string }
  /** What the page is called. */
  name: string
  description?: string
  tags?: readonly string[]
  createdBy: BundleAuthor
  createdAt: Date
  /** This product's version, for `generator`. */
  productVersion: string
  /** The semver range an importer's renderer must satisfy. */
  rendererVersion: string
  plugins: readonly PluginRequirement[]
  assets: readonly AssetRegistryEntry[]
}

export function pageManifest(input: PageManifestInput): BundleManifest {
  const references = documentReferences(input.document)
  const text = canonicalText(input.payload)

  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    kind: "page",
    bundleId: bundleIdFor("page", input.source),
    name: input.name,
    ...(input.description === undefined ? {} : { description: input.description }),
    tags: [...(input.tags ?? [])],
    createdAt: input.createdAt.toISOString(),
    createdBy: input.createdBy,
    generator: { product: "checkout-studio", version: input.productVersion },
    requires: {
      /*
       * The document's own version, not this build's. It is the version the
       * bundle *depends on* — what the document was written against — and an
       * importer decides from it whether a migration is needed.
       */
      schemaVersion: input.document.version,
      rendererVersion: input.rendererVersion,
      plugins: [...input.plugins],
      fonts: fontRequirements(input.document, input.theme),
      componentTypes: references.componentTypes,
    },
    contents: {
      pages: [input.name],
      symbols: [],
      sections: [],
      theme: "theme" in input.payload,
      settings: Object.keys(input.document.settings).length > 0,
      assets: input.assets.length,
      totalNodes: references.totalNodes,
      /*
       * Of the canonical text, which is the form the checksum is taken over
       * and the form a JSON bundle is written in. Measuring anything else
       * would describe a file nobody receives.
       */
      uncompressedBytes: new TextEncoder().encode(text).length,
    },
    checksum: checksumOf(input.payload),
  }
}

/**
 * A stable id for a bundle, from what it was made of.
 *
 * Twenty-four hex characters of a SHA-256 — ninety-six bits, which is far
 * past the point where two bundles collide by accident, and short enough to
 * read in a listing.
 */
function bundleIdFor(kind: string, source: { projectId: string; pageId: string }): string {
  const seed = `${BUNDLE_FORMAT}:${kind}:${source.projectId}:${source.pageId}`

  return `bnd_${contentHash(new TextEncoder().encode(seed)).slice(0, 24)}`
}
