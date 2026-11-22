import "server-only"

import { cacheKey } from "./cache"
import { redis, whenReady } from "./client"

/**
 * The embed allowlist, mirrored where the proxy can reach it.
 *
 * docs/rfcs/0002-embed-security-model.md § 1. The database holds the list;
 * this holds a copy the renderer's proxy can read while building a
 * `frame-ancestors` header. Proxy runs before the application, carries no
 * database client, and on Vercel may be deployed apart from it — so the copy
 * is not an optimisation, it is the only thing proxy can consult.
 *
 * ## This one does not degrade quietly
 *
 * Every other helper in this package swallows its errors, because a cache in
 * front of a source of truth must slow the product down rather than break
 * it. That reasoning does not reach here: proxy has no source to fall back
 * to, so a write that fails silently means the header keeps describing the
 * list as it was. For a removed origin, that is a domain that still frames
 * somebody's payment page after they revoked it.
 *
 * So these throw, and the caller decides. `del` on failure is a safe
 * direction — a missing key reads as no origins, which is
 * `frame-ancestors 'none'` and an embed that stops working. Loud, and
 * never permissive.
 *
 * ## No expiry
 *
 * `set` elsewhere takes a TTL. This cannot: an expired key is
 * indistinguishable from a page with no origins, so a TTL would switch
 * working embeds off on a timer. The key lives until the list changes.
 */

/** One key per page, matching the shape the allowlist is scoped to. */
export function embedOriginsKey(pageId: string): string {
  return cacheKey("embed-origins", pageId)
}

/**
 * Mirrors a page's list. Throws if it could not be written.
 *
 * A JSON array rather than a Redis set, because proxy reads this over
 * Upstash's HTTP API with a different client, and a plain string is the one
 * representation both speak without either having to agree about set
 * semantics or member ordering.
 */
export async function writeEmbedOrigins(pageId: string, origins: readonly string[]): Promise<void> {
  await whenReady()
  await redis.set(embedOriginsKey(pageId), JSON.stringify(origins))
}

/**
 * Drops a page's copy. Throws if it could not be dropped.
 *
 * The fail-closed move: afterwards proxy reads a miss, which is `'none'`.
 */
export async function forgetEmbedOrigins(pageId: string): Promise<void> {
  await whenReady()
  await redis.del(embedOriginsKey(pageId))
}

/**
 * The mirrored list, or null when there is no copy.
 *
 * Null and `[]` are different answers and both mean `'none'` to a header.
 * They are kept apart because only one of them is a page that was written
 * and has no origins; the other is a copy that is missing, which is worth
 * saying out loud in a log.
 */
export async function readEmbedOrigins(pageId: string): Promise<readonly string[] | null> {
  await whenReady()

  const raw = await redis.get(embedOriginsKey(pageId))

  return raw === null ? null : (JSON.parse(raw) as readonly string[])
}
