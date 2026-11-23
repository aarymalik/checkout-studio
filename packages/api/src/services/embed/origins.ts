import "server-only"

import { forgetEmbedOrigins, writeEmbedOrigins } from "@checkout-studio/cache"
import { embedOriginRepository, type TenantContext } from "@checkout-studio/database"
import type { StoredEmbedOrigin } from "@checkout-studio/database"
import { MAX_EMBED_ORIGINS, companionOrigin, parseEmbedOrigin } from "@checkout-studio/utils"

/**
 * Registering what may frame a page's embedded checkout.
 *
 * docs/rfcs/0002-embed-security-model.md § 1. Three things meet here and
 * nowhere else: what counts as an origin (`parseEmbedOrigin`), how many a
 * page may hold (`MAX_EMBED_ORIGINS`), and the row itself. The repository
 * guarantees the shape of the list and refuses to guess at the rest; this
 * decides the rest.
 *
 * ## Live, always, for now
 *
 * `parseEmbedOrigin` takes a mode because a development embed may name
 * `http://localhost`, and whether we build one is RFC 0002's third open
 * question. Nothing has answered it, so nothing here can ask for it: the
 * mode is `live`, and the parameter arrives with the feature rather than
 * ahead of it.
 *
 * ## Every change is mirrored to the cache
 *
 * The renderer's proxy builds `frame-ancestors` from the cached copy and
 * cannot reach a database, so a change that does not reach the cache is a
 * change that has not taken effect.
 *
 * What to do when the mirror fails depends on which way the list moved, and
 * the two are not symmetric. An addition that fails to mirror leaves the
 * cache holding a subset: the new domain does not work yet, which is
 * disappointing and safe. A removal that fails to mirror leaves the cache
 * holding a superset: a domain the merchant just revoked keeps framing their
 * payment page, which is the thing this list exists to prevent. So a failed
 * removal drops the key instead, and the embed stops working everywhere
 * until the next successful write — loud, and never permissive.
 *
 * Either way the error is raised. The row has already changed, so the caller
 * learns the request did not fully succeed rather than being told it did.
 *
 * ## The other spelling is offered, never added
 *
 * Registering `example.com` answers with `www.example.com` as a suggestion.
 * Adding it unasked would put an origin a merchant never typed into the one
 * list that decides who may frame their payment page — and the suggestion
 * costs them one press if they want it.
 */

export type OriginRegistration =
  | {
      ok: true
      origin: StoredEmbedOrigin
      /** The apex or `www` counterpart to offer next, when there is one. */
      companion: string | null
    }
  /** Not an origin we can use. `message` is addressed to the merchant. */
  | { ok: false; reason: "invalid"; message: string }
  /** Already registered for this page. */
  | { ok: false; reason: "duplicate" }
  | { ok: false; reason: "at-capacity"; ceiling: number }
  /** No such page, or not one this caller owns. */
  | { ok: false; reason: "not-found" }

/**
 * Mirrors the page's list after it has changed.
 *
 * `removal` picks the direction to fail in; see the note above.
 */
async function mirror(
  tenant: TenantContext,
  pageId: string,
  options: { removal: boolean },
): Promise<void> {
  const current = await embedOriginRepository.list(tenant, pageId)

  try {
    await writeEmbedOrigins(
      pageId,
      current.map((row) => row.origin),
    )
  } catch (error) {
    // Best effort, and the throw below stands whether or not it lands: a
    // key we could not write is not a key we can count on dropping.
    if (options.removal) await forgetEmbedOrigins(pageId).catch(() => undefined)

    throw error
  }
}

export async function registerOrigin(
  tenant: TenantContext,
  pageId: string,
  input: string,
): Promise<OriginRegistration> {
  const parsed = parseEmbedOrigin(input, "live")

  if (!parsed.ok) return { ok: false, reason: "invalid", message: parsed.message }

  const added = await embedOriginRepository.add(tenant, pageId, parsed.origin, MAX_EMBED_ORIGINS)

  if (!added.ok) {
    return added.reason === "at-capacity"
      ? { ok: false, reason: "at-capacity", ceiling: MAX_EMBED_ORIGINS }
      : added
  }

  await mirror(tenant, pageId, { removal: false })

  /*
   * Suggested only when it is not already registered, so a merchant who
   * added both is not asked a third time about the second one.
   */
  const other = companionOrigin(parsed.origin)
  const registered = await embedOriginRepository.list(tenant, pageId)

  return {
    ok: true,
    origin: added.origin,
    companion: other !== null && !registered.some((row) => row.origin === other) ? other : null,
  }
}

/**
 * Every origin registered for a page.
 *
 * Empty for a page the caller does not own, which is the repository's
 * answer and the right one: a list is a read, and a read scoped to the
 * owner makes somebody else's page look like a page with nothing on it.
 */
export async function listOrigins(
  tenant: TenantContext,
  pageId: string,
): Promise<readonly StoredEmbedOrigin[]> {
  return embedOriginRepository.list(tenant, pageId)
}

/**
 * Takes one off the list. False when it was not there to take.
 *
 * Nothing stops a merchant removing the last one. An embed with no origins
 * is `frame-ancestors 'none'` and stops working everywhere, which is a
 * thing they are allowed to do to their own checkout — and the way to turn
 * an embed off without unpublishing the page.
 */
export async function removeOrigin(
  tenant: TenantContext,
  pageId: string,
  originId: string,
): Promise<boolean> {
  const removed = await embedOriginRepository.remove(tenant, pageId, originId)

  // Only when something moved. Mirroring after a no-op would rewrite the key
  // for every stale delete a panel sends.
  if (removed) await mirror(tenant, pageId, { removal: true })

  return removed
}
