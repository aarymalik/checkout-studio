import { rateLimit } from "@checkout-studio/cache"
import { logger } from "@checkout-studio/observability"

/**
 * Where a browser says it refused to frame a checkout.
 *
 * docs/rfcs/0002-embed-security-model.md § 7. A blocked frame renders
 * nothing and reports it to a console the merchant does not have open. The
 * loader explains it on their page; this is the half that reaches us, so
 * support can see a mismatch before it is reported and can say which origin
 * a merchant's customers are actually loading from.
 *
 * ## Unauthenticated, and therefore assumed hostile
 *
 * Browsers send these without credentials, so there is nobody to
 * authenticate and anybody can post one. It is rate limited per address,
 * the body is capped, and every answer is the same — a report is not a
 * request for information and an error would only tell a prober what we
 * parse.
 *
 * ## Origins, never URLs
 *
 * A report carries full URLs, and the framing one is the merchant's page:
 * its path may hold a cart id, a search, or an order reference. Only the
 * origin is kept, which is the whole of what the allowlist is about, and
 * the page id comes from our own URL where it is ours to read.
 */

export const dynamic = "force-dynamic"

/** Generous for a browser, useless for anything trying to fill a log. */
const LIMIT = 60
const WINDOW_SECONDS = 60

/**
 * Bigger than any real report and small enough to discard without reading.
 *
 * A report is a few hundred bytes. The cap exists because this endpoint is
 * public and a body is read into memory before anything can judge it.
 */
const MAX_BYTES = 8_000

function clientIp(request: Request): string {
  // The first hop, as the edge saw it. Forgeable upstream, so it is a
  // rate-limiting subject and never an identity. Matches the submissions
  // endpoint beside it.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
}

/** The origin of a URL, or null for anything that is not one. */
function originOf(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null

  try {
    return new URL(value).origin
  } catch {
    /*
     * Not a URL, and that is ordinary: a blocked URL is reported as `self`,
     * `inline` or `eval` in some cases. Those say something, so they are
     * kept as they are rather than dropped — but only when short enough not
     * to be a sentence somebody put there.
     */
    return typeof value === "string" && value.length <= 20 ? value : null
  }
}

/** `/embed/<pageId>` → the page id, for a report about an embed. */
function pageFrom(documentUrl: unknown): string | null {
  if (typeof documentUrl !== "string") return null

  try {
    return /^\/embed\/([^/]+)$/u.exec(new URL(documentUrl).pathname)?.[1] ?? null
  } catch {
    return null
  }
}

interface Violation {
  documentURL?: unknown
  blockedURL?: unknown
  effectiveDirective?: unknown
  referrer?: unknown
}

/**
 * The violations in a body, whichever shape it arrived in.
 *
 * Two formats are live. The Reporting API sends an array of envelopes typed
 * `csp-violation`; the older `application/csp-report` sends one object under
 * a `csp-report` key, with hyphenated names. Both are read, because which
 * one a browser uses is the browser's decision and not ours.
 */
function violations(body: unknown): readonly Violation[] {
  if (Array.isArray(body)) {
    return body
      .filter(
        (entry): entry is { type: string; body: Violation } =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { type?: unknown }).type === "csp-violation",
      )
      .map((entry) => entry.body)
  }

  if (typeof body !== "object" || body === null) return []

  const legacy = (body as { "csp-report"?: Record<string, unknown> })["csp-report"]

  if (legacy === undefined) return []

  return [
    {
      documentURL: legacy["document-uri"],
      blockedURL: legacy["blocked-uri"],
      effectiveDirective: legacy["violated-directive"],
      referrer: legacy["referrer"],
    },
  ]
}

export async function POST(request: Request): Promise<Response> {
  const limit = await rateLimit({
    scope: "csp.report",
    subject: clientIp(request),
    limit: LIMIT,
    windowSeconds: WINDOW_SECONDS,
  })

  // 429 rather than silence, because this one is addressed to a browser's
  // reporting queue, which backs off on it.
  if (!limit.allowed) {
    return new Response(null, {
      status: 429,
      headers: { "retry-after": String(limit.retryAfter) },
    })
  }

  const raw = await request.text()

  if (raw.length > MAX_BYTES) return new Response(null, { status: 204 })

  let body: unknown

  try {
    body = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 204 })
  }

  for (const violation of violations(body)) {
    logger.warn("renderer.csp.violation", {
      pageId: pageFrom(violation.documentURL),
      directive:
        typeof violation.effectiveDirective === "string" ? violation.effectiveDirective : null,
      // Whichever of these the browser filled in is the one that names the
      // page that tried to frame us, and which that is differs between
      // them. Both are reduced to origins first.
      blockedOrigin: originOf(violation.blockedURL),
      referrerOrigin: originOf(violation.referrer),
    })
  }

  /*
   * Always, including for a body that made no sense. Nothing acts on the
   * answer — a browser fires these and forgets — so a status that varied
   * with what we understood would only be an oracle.
   */
  return new Response(null, { status: 204 })
}
