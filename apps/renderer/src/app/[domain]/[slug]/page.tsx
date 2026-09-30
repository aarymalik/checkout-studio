import { CheckoutRenderer } from "@checkout-studio/renderer"
import { logger } from "@checkout-studio/observability"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import type { ReactElement } from "react"

import { registry } from "../../../registry"
import { resolvePage } from "../../../published"

/**
 * A published checkout.
 *
 * A server component: the tree walker runs here, so a static component ships no
 * JavaScript to the visitor and only the interactive ones hydrate. That is the
 * whole reason the walker takes its context as an argument rather than reading
 * React context.
 *
 * `[domain]` is a path segment rather than a header for now. Serving a merchant
 * domain from its own hostname needs a rewrite in the proxy, which arrives with
 * publishing in Phase 15; until then this route is reachable directly and is the
 * same code either way.
 */

interface RouteParams {
  params: Promise<{ domain: string; slug: string }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { domain, slug } = await params
  const page = await resolvePage(decodeURIComponent(domain), slug)

  if (page === null) return { title: "Not found" }

  const seo = page.document.settings.seo

  return {
    title: seo?.title ?? page.title,
    ...(seo?.description === undefined ? {} : { description: seo.description }),
    ...(seo?.noIndex === true ? { robots: { index: false, follow: false } } : {}),
  }
}

export default async function PublishedPage({ params }: RouteParams): Promise<ReactElement> {
  const { domain, slug } = await params
  const page = await resolvePage(decodeURIComponent(domain), slug)

  if (page === null) notFound()

  if (page.degraded) {
    // Serving an older revision than the one that was published. The customer
    // gets a working checkout; we get told, because nobody would otherwise
    // notice that publishing silently stopped taking effect.
    logger.warn("renderer.page.degraded", { revisionId: page.revisionId, slug })
  }

  return (
    <CheckoutRenderer
      schema={page.document}
      theme={page.theme}
      registry={registry}
      mode="published"
      onWarnings={(warnings) => {
        for (const warning of warnings) {
          logger.warn("renderer.page.warning", {
            revisionId: page.revisionId,
            code: warning.code,
            nodeId: warning.nodeId,
            message: warning.message,
          })
        }
      }}
    />
  )
}
