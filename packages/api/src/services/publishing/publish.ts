import "server-only"

import { revisionRepository, type TenantContext } from "@checkout-studio/database"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"

import { revisionContent } from "./content"
import { validateForPublish } from "./validate"

/**
 * Taking a page live.
 *
 * docs/phases.md Phase 16: validate, snapshot the theme, create an
 * immutable revision, point the page at it.
 *
 * What a revision holds, and why it is a snapshot rather than a reference,
 * is `content.ts` — shared with named snapshots so the two cannot disagree
 * about whether a version is the same version.
 *
 * ## Publishing the same thing twice writes one revision
 *
 * A merchant who presses publish, changes nothing and presses it again has
 * not made a second version of anything. Writing one would put a row in
 * their history that differs from the one above it in nothing but its
 * timestamp, and make "roll back one" mean "roll back to the same page".
 *
 * Sameness is the hash `content.ts` takes, which is why it is taken there
 * rather than here: a snapshot and a publish of the same draft have to
 * agree about it.
 *
 * ## What goes wrong is answered, never thrown
 *
 * A page that cannot be published is a state a merchant is in, not an
 * exception. The issues come back in the shape the publish screen already
 * draws — see `validate.ts` — and the caller decides what to say.
 */

export type PublishOutcome =
  | {
      ok: true
      revisionId: string
      revisionNumber: number
      /** False when this published exactly what was already live. */
      created: boolean
      /** Problems that did not block it, worth showing after the fact. */
      warnings: readonly ValidationIssue[]
    }
  /** No such page, or not one this caller owns. */
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "blocked"; issues: readonly ValidationIssue[] }

export interface PublishInput {
  pageId: string
  /** Whatever the caller's registry contributes. See `validate.ts`. */
  validators: readonly DocumentValidatorRegistration[]
  /** The renderer build this revision was made against. */
  rendererVersion: string
}

export async function publishPage(
  tenant: TenantContext,
  input: PublishInput,
): Promise<PublishOutcome> {
  const checked = await validateForPublish(tenant, input.pageId, input.validators)

  if (!checked.ok) return checked

  const document = checked.document

  const content = await revisionContent(tenant, document, input.rendererVersion)

  const live = await revisionRepository.published(tenant, input.pageId)

  /*
   * Already live, so there is nothing to write. The page is answered with
   * the revision it is already serving rather than with a refusal: nothing
   * went wrong, and the merchant got what they asked for.
   */
  if (live !== null && live.contentHash === content.contentHash) {
    return {
      ok: true,
      revisionId: live.id,
      revisionNumber: live.number,
      created: false,
      warnings: checked.warnings,
    }
  }

  const revision = await revisionRepository.publish(tenant, {
    pageId: input.pageId,
    kind: "publish",
    ...content,
    rendererVersion: input.rendererVersion,
    createdBy: tenant.userId,
  })

  /*
   * Null only if the page stopped being this caller's between the check and
   * the write. Rare, and the honest answer is the one they would have got a
   * moment earlier.
   */
  if (revision === null) return { ok: false, reason: "not-found" }

  return {
    ok: true,
    revisionId: revision.id,
    revisionNumber: revision.number,
    created: true,
    warnings: checked.warnings,
  }
}
