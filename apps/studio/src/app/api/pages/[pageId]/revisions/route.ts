import { authenticate, route, snapshotPage } from "@checkout-studio/api"
import { pageRepository, revisionRepository } from "@checkout-studio/database"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

import { ENGINE_VERSION } from "@/studio/registry"

/**
 * A page's history, and a way to add to it on purpose.
 *
 * `GET` lists what there is; `POST` keeps the draft under a name. The
 * listing goes straight to the repository because it already returns only
 * what a history panel draws — the schema column is the largest in the
 * table and a list has no use for it, so a service in between would be a
 * layer that forwarded.
 */

function pageOf(params: Record<string, string>): string {
  const pageId = params["pageId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

  return pageId
}

export const GET = route(
  {
    authenticate,
    rateLimit: { scope: "pages.revisions.list", limit: 600, windowSeconds: 60 * 60 },
  },
  async ({ params, userId }) => {
    const pageId = pageOf(params)
    const [revisions, page] = await Promise.all([
      revisionRepository.list({ userId }, pageId),
      pageRepository.findById({ userId }, pageId),
    ])

    if (page === null) throw Errors.resource.notFound("Page")

    /*
     * The draft version comes with the history, because everything that
     * acts on a revision has to say which draft it was holding. Asking
     * the draft endpoint for it would transfer an entire document to
     * learn one number.
     */
    return {
      revisions,
      draftVersion: page.draftVersion,
      /*
       * Which one the world is being served, so a history can say so
       * rather than leaving somebody to work it out from the dates. Null
       * for a page that is not published.
       */
      publishedRevisionId: page.publishedRevisionId,
    }
  },
)

export const POST = route(
  {
    authenticate,
    rateLimit: { scope: "pages.revisions.snapshot", limit: 60, windowSeconds: 60 * 60 },
    body: z.object({ name: z.string() }),
  },
  async ({ body, params, userId }) => {
    const result = await snapshotPage(
      { userId },
      { pageId: pageOf(params), name: body.name, rendererVersion: ENGINE_VERSION },
    )

    if (result.ok) return { revision: { id: result.revisionId, number: result.revisionNumber } }

    if (result.reason === "not-found") throw Errors.resource.notFound("Page")

    /*
     * Both land on a field rather than in a banner. An empty name is about
     * the box somebody typed in, and a draft that cannot be read is about
     * the page — and saying which is the difference between a message
     * somebody can act on and one they can only be annoyed by.
     */
    if (result.reason === "unnamed") {
      throw Errors.validation.invalidInput([
        { path: "name", code: "unnamed", message: "Give this version a name." },
      ])
    }

    throw Errors.validation.invalidInput([
      {
        path: "page",
        code: "unreadable",
        message: "This page's content cannot be read, so there is nothing to keep.",
      },
    ])
  },
)
