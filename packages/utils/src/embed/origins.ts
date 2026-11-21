/**
 * Origins that may frame an embedded checkout.
 *
 * docs/rfcs/0002-embed-security-model.md § 1. The allowlist holds exact
 * origins, and this is where a string a merchant typed becomes one — or is
 * refused with a sentence they can act on.
 *
 * In `utils` because both ends need it and neither may import the other: the
 * API validates what is registered, and the renderer builds the
 * `frame-ancestors` directive from what was stored. Two parsers would
 * eventually disagree, and the disagreement would be an origin that saved
 * cleanly and then framed nothing.
 *
 * ## Exact origins, never patterns
 *
 * No wildcards. `frame-ancestors` accepts `*.example.com`, and the RFC
 * rejects it: `*.myshopify.com` is one entry granting framing rights to every
 * tenant of a shared platform. A merchant who needs many subdomains lists
 * them.
 */

/** Live refuses `http:`. A development embed does not, and takes no payment. */
export const EMBED_MODES = ["live", "development"] as const
export type EmbedMode = (typeof EMBED_MODES)[number]

/**
 * How many origins one embed may hold.
 *
 * Raised on request rather than unbounded. A list that grows without a
 * ceiling is a list nobody is auditing, and this one is the control standing
 * between a checkout and being framed somewhere it should not be.
 */
export const MAX_EMBED_ORIGINS = 20

export type OriginRefusal = "empty" | "wildcard" | "malformed" | "insecure" | "not-bare"

export type EmbedOrigin =
  { ok: true; origin: string } | { ok: false; reason: OriginRefusal; message: string }

/** Written for the merchant registering a domain, not for a log. */
const MESSAGES: Readonly<Record<OriginRefusal, string>> = {
  empty: "Enter a domain.",
  wildcard: "Wildcards are not accepted. Add each subdomain you use.",
  malformed: "That is not a valid domain.",
  insecure: "A checkout can only be framed by an https:// page.",
  "not-bare": "Enter only the domain — no path, query string or sign-in details.",
}

function refuse(reason: OriginRefusal): EmbedOrigin {
  return { ok: false, reason, message: MESSAGES[reason] }
}

/** Whether the input already names a scheme, as opposed to being a bare host. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu

/**
 * A string a merchant typed, as an exact origin.
 *
 * Normalising rather than merely checking, because two spellings of one
 * origin stored as two rows is a list that looks longer than it is and a
 * header with a redundant source in it. `URL` does most of it: the host is
 * lowercased, an international domain becomes punycode, and a default port
 * is dropped.
 *
 * A missing scheme is filled in as `https://`, since that is the only scheme
 * a live embed accepts and refusing `example.com` would be pedantry. A
 * development embed on `http://localhost` has to say so, because guessing
 * `http` from a hostname is the kind of helpfulness that silently downgrades
 * somebody's production domain.
 */
export function parseEmbedOrigin(input: string, mode: EmbedMode): EmbedOrigin {
  const text = input.trim()

  if (text === "") return refuse("empty")

  /*
   * Before `URL` sees it. A wildcard is not a parse failure — `new URL` reads
   * "*.example.com" as a host and hands back something that looks fine — so
   * refusing it afterwards would mean recognising it twice.
   */
  if (text.includes("*")) return refuse("wildcard")

  let url: URL

  try {
    url = new URL(HAS_SCHEME.test(text) ? text : `https://${text}`)
  } catch {
    return refuse("malformed")
  }

  if (url.protocol !== "https:") {
    /*
     * The one exception, and it is narrow: a development embed, which refuses
     * live payment. Any other http: origin is a payment page served in the
     * clear, whatever the merchant intended.
     */
    const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1"

    if (!(mode === "development" && url.protocol === "http:" && localhost)) {
      return refuse("insecure")
    }
  }

  /*
   * An origin is scheme, host and port. Anything else the merchant pasted —
   * the path they were on, a session in the query string, credentials — is
   * not part of what `frame-ancestors` matches, and silently dropping it
   * would teach them the field accepts a URL.
   */
  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return refuse("not-bare")
  }

  /*
   * No guard for an opaque origin here. `url.origin` is "null" for a `data:`
   * or `file:` URL, and neither can reach this line: both are refused above
   * for not being https, and every scheme that does reach it has a tuple
   * origin by definition.
   */
  return { ok: true, origin: url.origin }
}

/**
 * The apex for a `www` origin, or the `www` for an apex. Null when neither.
 *
 * Offered at registration because every merchant means both and finding out
 * otherwise costs a support ticket: a shopper who reaches the apex sees a
 * blank box where the checkout should be.
 *
 * Two labels is the test for an apex, which misses `example.co.uk` and will
 * not offer its pairing. That is the safe direction to be wrong in — a
 * suggestion that fails to appear is a minor annoyance, and one that proposes
 * `www.co.uk` is nonsense in a security control. A public suffix list would
 * fix it and is not worth the dependency for a suggestion.
 */
export function companionOrigin(origin: string): string | null {
  // An origin `parseEmbedOrigin` returned, and nothing else. Anything that
  // will not parse throws rather than answering null, because null here
  // means "no counterpart exists" and a caller cannot tell the two apart.
  const url = new URL(origin)

  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice("www.".length)

    return url.origin
  }

  if (url.hostname.split(".").length !== 2) return null

  url.hostname = `www.${url.hostname}`

  return url.origin
}

/**
 * The source list for a `frame-ancestors` directive.
 *
 * An empty list is `'none'` and never an empty directive. `frame-ancestors`
 * with no sources is a syntax error, and a browser that discards the
 * malformed directive would leave the page framable by anyone — the one
 * outcome this whole module exists to prevent.
 *
 * Deduplicated and sorted, so the header for a given set of origins is one
 * string rather than a function of the order they were registered in. That
 * is what makes it cacheable and what makes a test assert on a value rather
 * than on a set.
 */
export function frameAncestors(origins: readonly string[]): string {
  const unique = [...new Set(origins)].sort()

  return unique.length === 0 ? "'none'" : unique.join(" ")
}
