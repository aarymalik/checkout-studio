import "server-only"

import { assetResolver } from "@checkout-studio/api"
import { assetRepository, publishedRepository } from "@checkout-studio/database"
import type { PublishedPage } from "@checkout-studio/database"
import { logger } from "@checkout-studio/observability"
import { assetReferences, checkoutTheme, defaultTheme } from "@checkout-studio/schema"
import type { CheckoutSchema, CheckoutTheme } from "@checkout-studio/schema"
import { prepare } from "@checkout-studio/renderer"
import type { AssetUrls } from "@checkout-studio/plugin-sdk"

import { getEnv } from "./env"
import { registry } from "./registry"

/**
 * The fallback chain.
 *
 * ```
 * the published revision
 *      ↓ will not render
 * the last revision that did
 *      ↓ will not render either
 * nothing — the route shows a branded page
 * ```
 *
 * It lives here rather than in the renderer because only the application knows
 * what a revision is. The renderer has no database, and giving it one would put
 * server code inside the package that ships to a customer's browser.
 *
 * A published checkout must always render. The chain is what keeps that promise
 * when a revision turns out to be unreadable — which should not happen, since
 * publishing validates, but "should not happen" is not a plan for somebody's
 * checkout page.
 *
 * See docs/error-handling.md § Renderer Error Handling.
 */

/** A revision that parsed, before its assets have been looked up. */
interface ReadRevision {
  document: CheckoutSchema
  theme: CheckoutTheme
  title: string
  revisionId: string
  /** True when the published revision failed and an older one is being served. */
  degraded: boolean
}

export interface ResolvedPage extends ReadRevision {
  /**
   * The URLs for the assets this page names.
   *
   * Resolved before rendering because the renderer walks the tree
   * synchronously — it has to, to be a server component that ships no
   * JavaScript — so an asset that had to be fetched mid-walk could not be.
   */
  resolveAsset: (assetId: string) => AssetUrls | null
}

/** A revision, parsed and prepared, or null when it will not render. */
function readRevision(revision: PublishedPage): ReadRevision | null {
  const theme = checkoutTheme.safeParse(revision.theme)

  // A theme that does not parse is recoverable in a way a document is not: the
  // page still has its structure, and the default theme renders it plainly
  // rather than not at all.
  const resolved = theme.success ? theme.data : defaultTheme

  if (!theme.success) {
    logger.warn("renderer.revision.theme_invalid", {
      revisionId: revision.revisionId,
      pageId: revision.pageId,
      issues: theme.error.issues.length,
    })
  }

  const prepared = prepare(revision.schema, { registry, theme: resolved })

  if (!prepared.ok) {
    logger.error("renderer.revision.unreadable", {
      revisionId: revision.revisionId,
      pageId: revision.pageId,
      code: prepared.code,
      reason: prepared.message,
    })

    return null
  }

  for (const warning of prepared.warnings) {
    logger.warn("renderer.revision.warning", {
      revisionId: revision.revisionId,
      code: warning.code,
      message: warning.message,
    })
  }

  return {
    document: prepared.document,
    theme: resolved,
    title: revision.title,
    revisionId: revision.revisionId,
    degraded: false,
  }
}

/**
 * The resolver for one revision's assets.
 *
 * Only the ones the document names, loaded in one query — a project may hold a
 * thousand and a page may use three. Scoped to the revision's own project, so
 * a document cannot name a file belonging to another merchant.
 *
 * An id that resolves to nothing is reported by the renderer as
 * `asset-missing`, which is what an asset deleted after a page referenced it
 * should look like: a page that renders, minus one image.
 */
async function resolverFor(page: PublishedPage, document: CheckoutSchema) {
  const assets = await assetRepository.findForProject(page.projectId, assetReferences(document))

  return assetResolver(assets, getEnv().ASSET_BASE_URL)
}

/** The page serving `hostname/slug`, following the fallback chain. */
export async function resolvePage(hostname: string, slug: string): Promise<ResolvedPage | null> {
  const published = await publishedRepository.findByHostAndSlug(hostname, slug)

  if (published === null) return null

  const current = readRevision(published)

  if (current !== null) {
    return { ...current, resolveAsset: await resolverFor(published, current.document) }
  }

  const previous = await publishedRepository.previousRevision(
    published.pageId,
    published.revisionId,
  )

  if (previous === null) return null

  const fallback = readRevision(previous)

  if (fallback === null) return null

  /*
   * The older revision's own assets, not the failed one's. A revision is a
   * snapshot and may name a different set.
   */
  return {
    ...fallback,
    degraded: true,
    resolveAsset: await resolverFor(previous, fallback.document),
  }
}
