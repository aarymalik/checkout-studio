import "server-only"

import { assetRepository, pageRepository, type TenantContext } from "@checkout-studio/database"
import { parseDocument, validateReferences } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { resolveTheme } from "../../pages/theme"
import type { Bundle, BundleAuthor, BundlePayload } from "../types"
import { documentReferences } from "./collect"
import { pageManifest } from "./manifest"
import { pluginRequirements } from "./plugins"
import { redact } from "./redact"
import type { FoundSecret } from "./redact"
import { assetRegistry } from "./registry"

/**
 * Exporting one page.
 *
 * The workflow in docs/export-import.md, in the order it insists on:
 * authorize, collect, redact, build the manifest, checksum. Every step is
 * somewhere else and tested on its own; what lives here is the order, the
 * reading, and the refusals.
 *
 * ## It checks its own work before sealing it
 *
 * The document is parsed again *after* redaction, out of the payload that
 * will actually travel. Redaction rewrites a document, and a redactor that
 * broke one would otherwise produce a bundle that passes every gate on the
 * way out and is refused by the schema check on the way in — which is exactly
 * what happened once, and is why this is here rather than assumed. The
 * cheapest place to catch it is before anybody receives the file.
 *
 * ## A secret refuses; a gap warns
 *
 * A credential in the payload stops the export, because a bundle must never
 * contain one. A component type no installed plugin provides, or an asset the
 * library no longer holds, does not: the page is already like that, the spec
 * has a recovery workflow for exactly it, and refusing would leave a merchant
 * with no way to get their work out of a damaged project.
 *
 * ## What it has to be told
 *
 * Which plugin provides which component type, and what this build calls
 * itself. Plugins sit beside this package rather than beneath it, so a
 * service cannot reach a registry; the application that assembled the host is
 * the one that knows. Passing it in is also what lets this be tested without
 * starting one.
 */

export interface ExportEnvironment {
  /** Component type to plugin id, from `PluginHost.componentOwners()`. */
  owners: ReadonlyMap<string, string>
  /** Plugin id to the version installed here. */
  installed: ReadonlyMap<string, string>
  /** This build's version, for the manifest's `generator`. */
  productVersion: string
  /** The semver range an importer's renderer must satisfy. */
  rendererVersion: string
  /** A display name. Never an email, never a user id — see `BundleAuthor`. */
  author: BundleAuthor
  /** Defaults to the moment of export. Given, so a test can read a manifest. */
  now?: Date
}

export type ExportWarning =
  /** Types no installed plugin provides, so the bundle cannot say what to install. */
  | { code: "unsupported-types"; types: readonly string[] }
  /** Assets the page names that the library no longer holds. */
  | { code: "missing-assets"; assetIds: readonly string[] }

export type PageExport =
  | { ok: true; bundle: Bundle; warnings: ExportWarning[] }
  /** No such page in this project — or not this tenant's, which answers alike. */
  | { ok: false; reason: "not-found" }
  /** The stored draft is not a document we can read. */
  | { ok: false; reason: "unreadable" }
  /** A credential was in the payload. See `redact`. */
  | { ok: false; reason: "secret-found"; found: readonly FoundSecret[] }
  /** Redaction produced something that is no longer a page. */
  | { ok: false; reason: "invalid-after-redaction" }

export async function exportPage(
  tenant: TenantContext,
  pageId: string,
  environment: ExportEnvironment,
): Promise<PageExport> {
  const page = await pageRepository.findById(tenant, pageId)

  if (page === null) return { ok: false, reason: "not-found" }

  const parsed = parseDocument(page.draftSchema)

  /*
   * A draft is validated before it is stored, so this should not happen. If
   * it has, the honest answer is that we cannot read the page — exporting
   * whatever did parse would ship a file whose contents nobody chose.
   */
  if (!parsed.ok) return { ok: false, reason: "unreadable" }

  const theme = await resolveTheme(page.projectId, parsed.document.theme)

  /*
   * The whole library, filtered by the registry to what this page names. One
   * query rather than one per asset, and the same whole-project pass the
   * delete check makes — a project holds tens of these, and two queries that
   * could disagree are worse than one that reads a little too much.
   */
  const library = await assetRepository.list(tenant)
  const registry = assetRegistry(parsed.document, library)

  const redacted = redact({
    page: { name: page.title, slug: page.slug },
    document: parsed.document,
    theme,
    assets: registry.entries,
  } satisfies BundlePayload)

  if (!redacted.ok) return { ok: false, reason: "secret-found", found: redacted.found }

  const sealed = readBack(redacted.payload)

  if (sealed === null) return { ok: false, reason: "invalid-after-redaction" }

  const plugins = pluginRequirements(
    documentReferences(sealed).componentTypes,
    environment.owners,
    environment.installed,
  )

  const manifest = pageManifest({
    payload: redacted.payload,
    document: sealed,
    theme,
    source: { projectId: page.projectId, pageId: page.id },
    name: page.title,
    createdBy: environment.author,
    createdAt: environment.now ?? new Date(),
    productVersion: environment.productVersion,
    rendererVersion: environment.rendererVersion,
    plugins: plugins.plugins,
    assets: registry.entries,
  })

  return {
    ok: true,
    bundle: { manifest, payload: redacted.payload },
    warnings: warningsFor(plugins.unsupported, registry.missing),
  }
}

/**
 * The document and theme as they are *in the payload*, not as they were read.
 *
 * Parsed out of what will travel rather than reused from before redaction, so
 * the manifest describes the file and not the intention behind it.
 *
 * ## The document, and not the theme
 *
 * Only the document is read back, because only the document can be damaged
 * this way. Its `nodes` map is keyed by node id — user data, any string — so
 * a key the policy acts on takes a node with it. A theme's required keys are
 * all names the format chose; the one group a person names is `colors.custom`,
 * and every entry in it is optional, so losing one leaves a theme that still
 * parses. The theme that goes into the manifest is therefore the one that was
 * resolved, and if that stops being true the thing to change is this comment
 * and the check under it.
 *
 * ## References too, not only the shape
 *
 * `parseDocument` answers whether something is shaped like a document. It
 * does not answer whether the tree holds together, and the way redaction
 * breaks a document is by removing a node rather than by malforming one:
 * `nodes` is keyed by node id, a node id is any string, and a node whose id
 * collides with a key the policy removes simply disappears — leaving a parent
 * pointing at nothing. That parses. It is not a page.
 *
 * So the check is the one the importer will make, which is the only check
 * worth making here.
 */
function readBack(payload: BundlePayload): CheckoutSchema | null {
  const document = parseDocument(payload["document"])

  if (!document.ok) return null

  return validateReferences(document.document).length > 0 ? null : document.document
}

function warningsFor(unsupported: readonly string[], missing: readonly string[]): ExportWarning[] {
  const warnings: ExportWarning[] = []

  if (unsupported.length > 0) warnings.push({ code: "unsupported-types", types: unsupported })
  if (missing.length > 0) warnings.push({ code: "missing-assets", assetIds: missing })

  return warnings
}
