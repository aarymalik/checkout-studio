import { authenticate, readDraft, route, saveDraft } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * The draft: the mutable working copy of a page.
 *
 * Autosave writes here and creates no revision. Every write carries the version
 * it was made against, and there is no unconditional path — see
 * docs/api-spec.md § Save Draft.
 */

/** RFC 6902. Only the operations a document edit produces. */
const operation = z.union([
  z.object({ op: z.literal("add"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.string() }),
  z.object({ op: z.literal("replace"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("move"), from: z.string(), path: z.string() }),
  z.object({ op: z.literal("copy"), from: z.string(), path: z.string() }),
  z.object({ op: z.literal("test"), path: z.string(), value: z.unknown() }),
])

function pageOf(params: Record<string, string>): string {
  const pageId = params["pageId"]

  if (pageId === undefined || pageId === "") throw Errors.resource.notFound("Page")

  return pageId
}

export const GET = route({ authenticate }, async ({ params, userId }) => {
  const draft = await readDraft({ userId }, pageOf(params))

  if (draft === null) throw Errors.resource.notFound("Page")

  return { schema: draft.document, draftVersion: draft.draftVersion }
})

export const PATCH = route(
  {
    authenticate,
    body: z.object({
      baseVersion: z.number().int().nonnegative(),
      // A page has thousands of nodes; a patch that touches all of them is not
      // an edit, it is a replacement, and it should arrive as one.
      patch: z.array(operation).min(1).max(5_000),
    }),
    // Generous: autosave writes every five seconds while somebody is working,
    // and several tabs on several pages share this limit.
    rateLimit: { scope: "pages.draft", limit: 600, windowSeconds: 60 },
  },
  async ({ body, params, userId }) => {
    const result = await saveDraft({ userId }, pageOf(params), {
      baseVersion: body.baseVersion,
      patch: body.patch as Parameters<typeof saveDraft>[2]["patch"],
    })

    if (result.ok) return { draftVersion: result.draftVersion }

    /*
     * The refusal carries the version that won, and not the document.
     *
     * A page is hundreds of kilobytes and the client has to fetch the draft
     * anyway in order to show it — and the client is the only party that can
     * describe the conflict, since it still holds the version it started from
     * and a draft write creates no revision for the server to reconstruct one.
     */
    if (result.reason === "conflict") throw Errors.resource.draftConflict(result.currentVersion)

    if (result.reason === "invalid") {
      throw Errors.validation.invalidInput(
        result.problems.map((problem) => ({
          path: problem.path ?? problem.nodeIds.join(", "),
          code: problem.code,
          message: problem.message,
        })),
      )
    }

    throw Errors.validation.invalidInput([
      { path: "patch", code: "unpatchable", message: result.message },
    ])
  },
)
