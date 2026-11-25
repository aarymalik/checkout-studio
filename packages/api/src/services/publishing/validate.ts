import "server-only"

import { assetRepository, pageRepository, type TenantContext } from "@checkout-studio/database"
import { blocksPublish } from "@checkout-studio/plugin-sdk"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"
import { assetReferrers, parseDocument, validateReferences } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"

/**
 * Whether a page can go live, and what to fix if not.
 *
 * docs/phases.md Phase 16, step 1. Publishing is the moment a page stops
 * being somebody's draft and starts being a stranger's checkout, and it is
 * the last point at which a problem costs an afternoon rather than an order.
 *
 * ## The rules are not here
 *
 * "Anything that shows a total has something to total" is the checkout
 * plugin's rule, and this package may not import a plugin — they are the
 * same layer. So the validators arrive as an argument, from whichever
 * registry the caller assembled, and everything plugins already contribute
 * runs unchanged: heading order, condition cycles, embeds beside the
 * payment form, carts with nothing in them.
 *
 * What is decided here is only what no plugin can know, because it is about
 * the document rather than about components: whether the draft parses,
 * whether its tree holds together, and whether the assets it draws still
 * exist.
 *
 * ## One shape for every problem
 *
 * Engine problems are `ValidationIssue`s under an `engine.` namespace, the
 * same shape a plugin returns. The publish screen lists them together
 * because a merchant does not care which layer noticed, and `blocksPublish`
 * then grades the whole list rather than this file deciding twice.
 *
 * ## Warnings come back on success
 *
 * An `info` or `warning` does not stop a publish and is still worth saying,
 * so a page that is fine returns them with it. Dropping them would make the
 * only way to see a warning be to have an error beside it.
 */

export type PublishCheck =
  | { ok: true; document: CheckoutSchema; warnings: readonly ValidationIssue[] }
  /** No such page, or not one this caller owns. */
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "blocked"; issues: readonly ValidationIssue[] }

/** A draft nobody can read. Reported, never thrown: it is a page's state. */
const UNREADABLE = "engine.unreadable"
/** A node pointing at a node that is not there. */
const BROKEN_REFERENCE = "engine.broken-reference"
/** A picture the page draws and the project no longer has. */
const MISSING_ASSET = "engine.missing-asset"

export async function validateForPublish(
  tenant: TenantContext,
  pageId: string,
  validators: readonly DocumentValidatorRegistration[],
): Promise<PublishCheck> {
  const page = await pageRepository.findById(tenant, pageId)

  if (page === null) return { ok: false, reason: "not-found" }

  const parsed = parseDocument(page.draftSchema)

  /*
   * Nothing else can run on a document that did not parse, so this answers
   * alone rather than joining a list. The schema problems are not passed
   * through: they name paths inside a document, and the person reading this
   * screen can act on "it cannot be opened" and on nothing more precise.
   */
  if (!parsed.ok) {
    return {
      ok: false,
      reason: "blocked",
      issues: [
        {
          rule: UNREADABLE,
          severity: "critical",
          message:
            "This page's content cannot be read, so it cannot be published. Open it in the editor — the last version that opened is still there.",
          nodeIds: [],
        },
      ],
    }
  }

  const document = parsed.document
  const issues = [
    ...structuralIssues(document),
    ...(await missingAssets(page.projectId, document)),
    ...validators.flatMap((validator) => validator.validate(document)),
  ]

  if (blocksPublish(issues)) return { ok: false, reason: "blocked", issues }

  return { ok: true, document, warnings: issues }
}

/**
 * Whether the tree holds together.
 *
 * `parseDocument` says every node is shaped correctly and says nothing about
 * whether they point at each other sensibly, which is a separate walk and
 * the one that catches a page that opens to nothing.
 */
function structuralIssues(document: CheckoutSchema): readonly ValidationIssue[] {
  return validateReferences(document).map((problem) => ({
    rule: BROKEN_REFERENCE,
    severity: "critical" as const,
    /*
     * The schema's own sentence. It is written for this audience already —
     * "the root points at a node that is not there" — and restating it here
     * would be a second wording to keep in step with the first.
     */
    message: problem.message,
    nodeIds: problem.nodeIds,
  }))
}

/**
 * Pictures the page draws that the project no longer has.
 *
 * A reference survives the asset being deleted, because an asset is deleted
 * from a library and not from every page that drew it. On a draft that is a
 * gap in the canvas; published, it is a gap on somebody's checkout.
 *
 * An error rather than critical: the page works, and the person publishing
 * can see exactly what is wrong by looking at it.
 */
async function missingAssets(
  projectId: string,
  document: CheckoutSchema,
): Promise<readonly ValidationIssue[]> {
  const referrers = assetReferrers(document)

  if (referrers.size === 0) return []

  const present = new Set(
    (await assetRepository.findForProject(projectId, referrers.keys())).map((asset) => asset.id),
  )

  return [...referrers]
    .filter(([assetId]) => !present.has(assetId))
    .map(([, nodeIds]) => ({
      rule: MISSING_ASSET,
      severity: "error" as const,
      message:
        "This draws an image the project no longer has. Choose another one, or remove it before publishing.",
      nodeIds,
    }))
}
