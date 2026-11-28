import { CheckoutRenderer } from "@checkout-studio/renderer"
import { logger } from "@checkout-studio/observability"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import type { ReactElement } from "react"

import { registry } from "../../../registry"
import { resolvePreview } from "../../../published"

/**
 * A draft, shown to somebody holding a link.
 *
 * docs/api-spec.md § Create Preview Link. The point is to show a client a
 * checkout without publishing it, so this renders the draft as it stands
 * — current theme, current symbols — rather than any revision.
 *
 * ## Never cached, never indexed
 *
 * A published page is immutable at a revision and can be cached hard. A
 * draft is whatever it is this second, so caching one would show somebody
 * a page the merchant has already moved past. `force-dynamic` says so.
 *
 * `noindex` for a stronger reason than tidiness: a preview URL in a search
 * result is an unfinished checkout, reachable by anybody who finds it,
 * with the secret that was supposed to be private sitting in the result.
 *
 * ## A dead link is a 404
 *
 * Revoked, expired, never issued, tampered with, or for a page since
 * deleted — `resolvePreview` answers null to all of them and this answers
 * the same way to all of them. Somebody guessing learns nothing about
 * which guesses were closer.
 */

interface RouteParams {
  params: Promise<{ token: string }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Preview", robots: { index: false, follow: false } }
}

export default async function PreviewPage({ params }: RouteParams): Promise<ReactElement> {
  const { token } = await params
  const page = await resolvePreview(decodeURIComponent(token))

  if (page === null) notFound()

  return (
    <CheckoutRenderer
      schema={page.document}
      theme={page.theme}
      registry={registry}
      /*
       * Rendered as a published page would be, not as the editor's canvas
       * is: somebody looking at a preview is looking at what a customer
       * would see, and a fallback that named a broken component would be
       * showing them our internals.
       */
      mode="published"
      resolveAsset={page.resolveAsset}
      onWarnings={(warnings) => {
        for (const warning of warnings) {
          logger.warn("renderer.preview.warning", {
            pageId: page.revisionId,
            code: warning.code,
            nodeId: warning.nodeId,
            message: warning.message,
          })
        }
      }}
    />
  )
}
