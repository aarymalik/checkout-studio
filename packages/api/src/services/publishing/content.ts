import "server-only"

import type { TenantContext } from "@checkout-studio/database"
import { CURRENT_VERSION, canonicalText, serialize } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"
import { contentHash } from "@checkout-studio/utils"

import { resolveTheme } from "../pages/theme"
import { snapshotSymbols } from "../pages/symbols"

/**
 * What a revision holds, resolved and hashed.
 *
 * Shared by every path that writes one — publishing and named snapshots —
 * because two of these would be two answers to "is this the same version",
 * and the one that fell behind would be the one nobody noticed. A snapshot
 * taken today and a publish of the same draft tomorrow have to agree.
 *
 * ## A snapshot, not a reference
 *
 * The theme and symbols are resolved now and stored in the row. A revision
 * that referred to them would change when somebody edited a colour, which
 * would be a published checkout changing without anybody publishing — and
 * would make returning to an old revision return to the old page wearing
 * today's paint.
 *
 * They are resolved together, because read at two moments they would
 * describe a page that never existed.
 *
 * ## The hash cannot be taken afterwards
 *
 * The JSON columns are `jsonb` and Postgres does not keep key order, so a
 * hash recomputed from a stored revision differs from one taken of the
 * same content a moment earlier. It is taken here and stored beside the
 * content it describes.
 *
 * Each part is canonicalised by the rule meant for it. The document goes
 * through `serialize`, which is its own canonical form and does more than
 * order keys; everything else through `canonicalText`, which exists for
 * values that are not documents. The schema package keeps those two apart
 * deliberately and so does this.
 */

export interface RevisionContent {
  /** Ready for the column: no `undefined`, which is not a thing JSON has. */
  schema: object
  theme: object
  symbols: object
  schemaVersion: string
  /** sha256 over the canonical form of everything above. */
  contentHash: string
}

export async function revisionContent(
  tenant: TenantContext,
  document: CheckoutSchema,
  rendererVersion: string,
): Promise<RevisionContent> {
  const [theme, symbols] = await Promise.all([
    resolveTheme(document.projectId, document.theme),
    snapshotSymbols(tenant, document),
  ])

  /*
   * The renderer version is part of sameness because a revision built by a
   * different renderer may draw differently, which makes it a different
   * thing to have published.
   */
  const hash = contentHash(
    new TextEncoder().encode(
      canonicalText({
        schema: serialize(document),
        theme,
        symbols,
        schemaVersion: CURRENT_VERSION,
        rendererVersion,
      }),
    ),
  )

  return {
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
    contentHash: hash,
  }
}
