import { CheckoutRenderer } from "@checkout-studio/renderer"
import { logger } from "@checkout-studio/observability"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import type { ReactElement } from "react"

import { registry } from "../../../registry"
import { resolveEmbed } from "../../../published"
import { FrameChannel } from "./FrameChannel"

/**
 * A checkout inside somebody else's page.
 *
 * docs/renderer.md § Embed Mode: `embed.js` inserts an iframe pointing here,
 * and the checkout always renders on a page we serve. It never renders into
 * the merchant's document, so their scripts and styles cannot read or alter
 * the payment form.
 *
 * Who may frame this is not decided here. It is a response header, because
 * `frame-ancestors` has no meta-tag equivalent and a page cannot set its own
 * headers — `proxy.ts` sets it from the allowlist, and a request that
 * arrives with no registered origins is framable by nobody.
 *
 * Reached by page id rather than hostname and slug, because the merchant's
 * page knows which checkout it embedded and nothing about where we serve it.
 * The id is public by design: it appears in the snippet on their page, and
 * nothing here depends on it being a secret.
 */

interface RouteParams {
  params: Promise<{ pageId: string }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  /*
   * Never indexed. An embed URL is a fragment meant to be seen inside the
   * merchant's page; in a search result it is a checkout with no shop around
   * it, competing with the page that embeds it.
   */
  return { title: "Checkout", robots: { index: false, follow: false } }
}

export default async function EmbeddedCheckout({ params }: RouteParams): Promise<ReactElement> {
  const { pageId } = await params
  const page = await resolveEmbed(pageId)

  if (page === null) notFound()

  if (page.degraded) {
    logger.warn("renderer.embed.degraded", { revisionId: page.revisionId, pageId })
  }

  return (
    <>
      {/*
        The loader's half of the channel. Rendered beside the checkout
        rather than around it, so nothing about the page depends on it: a
        frame that cannot talk to its host still shows a working checkout.
      */}
      <FrameChannel />
      <CheckoutRenderer
        schema={page.document}
        theme={page.theme}
        registry={registry}
        mode="embed"
        resolveAsset={page.resolveAsset}
        onWarnings={(warnings) => {
          for (const warning of warnings) {
            logger.warn("renderer.embed.warning", {
              revisionId: page.revisionId,
              code: warning.code,
              nodeId: warning.nodeId,
              message: warning.message,
            })
          }
        }}
      />
    </>
  )
}
