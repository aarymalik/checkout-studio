import { authenticate, issuePreview, listPreviews, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

import { getEnv } from "@/env"

/**
 * Links that show a draft to somebody who cannot sign in.
 *
 * docs/api-spec.md § Create Preview Link. `POST` makes one, `GET` lists
 * what a page has.
 *
 * ## The URL is built here
 *
 * The service returns a secret; what a merchant needs is something they
 * can paste into a message. Where published checkouts are served from is
 * the application's configuration rather than the service's, so the
 * joining happens here — and it is the same `RENDERER_URL` the embed
 * snippet names, because they are the same renderer.
 *
 * ## The secret is in the answer and nowhere else
 *
 * It is never stored and never returned again, so the listing can say
 * when a link was made and whether it still works, and cannot say what
 * its URL is. A merchant who loses one makes another.
 */

function pageOf(params: Record<string, string>): string {
  const pageId = params["pageId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

  return pageId
}

export const GET = route(
  {
    authenticate,
    rateLimit: { scope: "pages.previews.list", limit: 600, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => ({
    links: await listPreviews({ userId }, pageOf(params)),
  }),
)

export const POST = route(
  {
    authenticate,
    /*
     * A link is a thing a person shares, so this is held to roughly what
     * a person does. Each one is also a row that lives for up to a month.
     */
    rateLimit: { scope: "pages.previews.issue", limit: 60, windowSeconds: 60 * 60 },
    body: z.object({ hours: z.number().int().positive().optional() }),
  },
  async ({ body, params, userId }) => {
    const result = await issuePreview(
      { userId },
      { pageId: pageOf(params), ...(body.hours === undefined ? {} : { hours: body.hours }) },
    )

    if (!result.ok) throw Errors.resource.notFound("Page")

    return {
      link: {
        id: result.preview.id,
        /*
         * Encoded, because a token is base64url and that is URL-safe —
         * but the encoding is not conditional on today's alphabet being
         * safe tomorrow.
         */
        url: `${getEnv().RENDERER_URL}/preview/${encodeURIComponent(result.preview.token)}`,
        expiresAt: result.preview.expiresAt,
      },
    }
  },
)
