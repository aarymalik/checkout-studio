import { authenticate, listOrigins, registerOrigin, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * The domains that may frame a page's embedded checkout.
 *
 * docs/rfcs/0002-embed-security-model.md § 1. Page-scoped, like everything
 * else under `/api/pages`, because the page names its own project and
 * asking the caller for one as well would be a second answer to a question
 * the row already settles.
 *
 * Deliberately thin. What is only true over HTTP is which status each
 * refusal becomes; whether a string is an origin, and how many a page may
 * hold, are decided in the service and tested against a real database
 * there.
 */

function pageOf(params: Record<string, string>): string {
  const pageId = params["pageId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

  return pageId
}

export const GET = route(
  {
    authenticate,
    rateLimit: { scope: "embed.origins.list", limit: 600, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => ({ origins: await listOrigins({ userId }, pageOf(params)) }),
)

export const POST = route(
  {
    authenticate,
    /*
     * Held to what a person does. Twenty is the ceiling on a list, so this
     * is generous for a merchant setting one up and mean for anything
     * walking the endpoint.
     */
    rateLimit: { scope: "embed.origins.register", limit: 60, windowSeconds: 60 * 60 },
    body: z.object({ origin: z.string() }),
  },
  async ({ body, params, userId }) => {
    const result = await registerOrigin({ userId }, pageOf(params), body.origin)

    if (result.ok) return { origin: result.origin, companion: result.companion }

    if (result.reason === "not-found") throw Errors.resource.notFound("Page")

    /*
     * Every refusal lands on the field the merchant typed into, so a panel
     * can put the sentence under the box rather than in a banner about
     * something else. The service writes those sentences; they are about
     * what was typed and are addressed to whoever typed it.
     */
    const message =
      result.reason === "invalid"
        ? result.message
        : result.reason === "duplicate"
          ? "That domain is already registered for this checkout."
          : `A checkout can have ${String(result.ceiling)} domains. Remove one to add another.`

    throw Errors.validation.invalidInput([{ path: "origin", code: result.reason, message }])
  },
)
