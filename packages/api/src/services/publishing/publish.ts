import "server-only"

import { revisionRepository, type TenantContext } from "@checkout-studio/database"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION, canonicalText, serialize } from "@checkout-studio/schema"
import { contentHash } from "@checkout-studio/utils"

import { resolveTheme } from "../pages/theme"
import { snapshotSymbols } from "../pages/symbols"
import { validateForPublish } from "./validate"

/**
 * Taking a page live.
 *
 * docs/phases.md Phase 16: validate, snapshot the theme, create an
 * immutable revision, point the page at it.
 *
 * ## A revision is a snapshot, not a reference
 *
 * The theme and the symbols are resolved now and stored in the row. A
 * revision that referred to them would change when somebody edited a
 * colour, which would mean a published checkout changing without anybody
 * publishing — and the thing a merchant is promised when they press this is
 * that what they saw is what a customer gets, until they say otherwise.
 *
 * That is also what makes rollback mean something later: an older revision
 * is the page as it was, not the page as it was with today's theme.
 *
 * ## Publishing the same thing twice writes one revision
 *
 * A merchant who presses publish, changes nothing and presses it again has
 * not made a second version of anything. Writing one would put a row in
 * their history that differs from the one above it in nothing but its
 * timestamp, and make "roll back one" mean "roll back to the same page".
 *
 * Sameness is a hash over the canonical form of everything the revision
 * holds, taken before the row is written — it cannot be taken afterwards,
 * because the columns are `jsonb` and Postgres does not keep key order.
 * The ordering is the schema package's own, used for the theme and the
 * symbols as well, so there is one rule rather than two that can drift.
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

  /*
   * Resolved together and stored together. A theme read at one moment and
   * symbols at another would be a revision of a page that never existed,
   * which is a strange thing to be able to roll back to.
   */
  const [theme, symbols] = await Promise.all([
    resolveTheme(document.projectId, document.theme),
    snapshotSymbols(tenant, document),
  ])

  /*
   * Everything the revision holds, in one canonical string. The renderer
   * version is in it because a revision built by a different renderer may
   * draw differently, which makes it a different thing to have published.
   */
  const hash = contentHash(
    new TextEncoder().encode(
      canonicalText({
        /*
         * The document through `serialize`, which is its own canonical
         * form and does more than order keys. `canonicalText` orders the
         * rest — it exists for values that are not documents, and the
         * schema package keeps the two apart deliberately.
         */
        schema: serialize(document),
        theme,
        symbols,
        schemaVersion: CURRENT_VERSION,
        rendererVersion: input.rendererVersion,
      }),
    ),
  )

  const live = await revisionRepository.published(tenant, input.pageId)

  /*
   * Already live, so there is nothing to write. The page is answered with
   * the revision it is already serving rather than with a refusal: nothing
   * went wrong, and the merchant got what they asked for.
   */
  if (live !== null && live.contentHash === hash) {
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
    /*
     * Through `serialize`, which is the document's canonical form — the
     * same bytes the export pipeline hashes. A revision written some other
     * way would be a revision that cannot be compared with one that was.
     */
    schema: JSON.parse(serialize(document)) as object,
    /*
     * Through JSON rather than cast. A resolved theme has optional
     * properties, and an absent one is `undefined` in TypeScript and not a
     * thing JSON has — a cast would store the type's shape and leave the
     * column holding whatever the driver made of it.
     */
    theme: JSON.parse(JSON.stringify(theme)) as object,
    symbols: JSON.parse(JSON.stringify(symbols)) as object,
    schemaVersion: CURRENT_VERSION,
    rendererVersion: input.rendererVersion,
    contentHash: hash,
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
