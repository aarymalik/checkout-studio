import { Redis } from "@upstash/redis"

import { getEnv } from "./env"

/**
 * Who may frame a given embed, as the proxy can ask it.
 *
 * docs/rfcs/0002-embed-security-model.md § 1. The list lives in Postgres and
 * the application mirrors every change of it to Redis, because the proxy
 * runs before the application, carries no database client, and on Vercel may
 * be deployed apart from it.
 *
 * So this reads over HTTP. `@upstash/redis` holds no socket and no
 * connection state — the client object is a base URL and a token — which is
 * what makes a module-level instance here a different thing from the
 * long-lived singleton Next's Proxy documentation warns about.
 *
 * ## Every failure is `'none'`
 *
 * A miss, a malformed value, an unreachable cache: all of them answer with
 * no origins, which becomes `frame-ancestors 'none'` and an embed that
 * refuses to be framed. There is no safe permissive fallback here — the one
 * alternative to being too strict is letting an unknown page be framed by
 * anyone, and a cache outage is not a reason to do that.
 *
 * The cost is honest and worth stating: while the cache is down, embeds stop
 * working. They do not half-work, and they do not open up.
 */

/** `/embed/<pageId>`, and nothing nested under it. */
const EMBED_PATH = /^\/embed\/([^/]+)\/?$/u

/** The page an embed request is for, or null when the path is not one. */
export function embeddedPageId(pathname: string): string | null {
  return EMBED_PATH.exec(pathname)?.[1] ?? null
}

let client: Redis | undefined

function redis(): Redis {
  const env = getEnv()

  client ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
    /*
     * One attempt. The default retries five times with growing backoff,
     * which on an unreachable cache would hold a checkout's first byte for
     * seconds before answering the same way it would have answered at once.
     */
    retry: false,
  })

  return client
}

/**
 * The origins registered for a page. Empty whenever we cannot say otherwise.
 *
 * The value is written as a JSON array and `@upstash/redis` parses it, so a
 * well-formed read arrives as an array already. Anything else — a miss, a
 * string, a number somebody put there by hand — is treated as no origins
 * rather than coerced.
 */
export async function framingOrigins(pageId: string): Promise<readonly string[]> {
  try {
    const cached = await redis().get<unknown>(`cs:embed-origins:${pageId}`)

    if (!Array.isArray(cached)) return []

    return cached.filter((origin): origin is string => typeof origin === "string")
  } catch {
    return []
  }
}
