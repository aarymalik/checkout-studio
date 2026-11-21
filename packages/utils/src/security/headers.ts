/**
 * The headers every renderer response carries.
 *
 * docs/security.md § Security Headers names six and says to always send them.
 * Until now none were sent: there was no proxy and no `headers()` in
 * `next.config.ts`, so a published checkout went out with browser defaults.
 *
 * Pure, and separate from the proxies that apply them, because what the
 * values should be is a security question and where they are attached is a
 * framework one. These are asserted directly in tests; a proxy is a loop
 * over them.
 *
 * In `utils` rather than in either application, because both send them and
 * neither may import the other. Two copies of a security policy drift, and
 * the copy that falls behind is the one nobody is looking at.
 *
 * ## The CSP here is `frame-ancestors` and nothing else
 *
 * docs/security.md § Scripts on Checkout Pages requires every script origin
 * on a published checkout to be enumerated, and that set is a property of the
 * page: which tracking integrations the merchant enabled, which asset host
 * serves its images. A `script-src` written here would have to be either
 * wrong or so wide it says nothing, so it is not written here. It arrives
 * with publishing, which is what knows a page's integrations.
 *
 * `frame-ancestors` does not have that problem and is the one directive with
 * no meta-tag equivalent, so a header is the only place it can go.
 */

/**
 * Permitting payment, deliberately.
 *
 * RFC 0002 § 6: this is the header most likely to break wallets, because it
 * is one we are obliged to send and its restrictive default switches off the
 * feature Stripe needs three frames down. A renderer response is a checkout
 * or it is nothing, so `payment` is allowed to this origin and to Stripe's
 * script, and the features a checkout has no use for are denied outright.
 */
const PERMISSIONS = [
  'payment=(self "https://js.stripe.com")',
  "camera=()",
  "microphone=()",
  "geolocation=()",
].join(", ")

/**
 * Two years, with subdomains, and preload-eligible.
 *
 * docs/security.md § HTTPS makes HTTPS mandatory and redirects HTTP. A
 * redirect is one round trip an attacker can sit in front of; this removes
 * it for every visit after the first.
 */
const STRICT_TRANSPORT = "max-age=63072000; includeSubDomains; preload"

export interface SecurityHeaderOptions {
  /**
   * The `frame-ancestors` source list, as `frameAncestors` builds it.
   *
   * `'none'` for everything that is not an embed, which is what
   * docs/security.md § Clickjacking means by "every other route keeps DENY".
   */
  frameAncestors: string
}

/**
 * The header set for one response.
 *
 * `X-Frame-Options` is sent alongside the CSP and only when nothing may
 * frame the page. It has no syntax for a list of origins — `ALLOW-FROM` was
 * never implemented by Chrome and is gone from Firefox — so on an embed it
 * would either contradict the CSP or have to be omitted. Omitted is correct:
 * every browser that can frame an embed understands `frame-ancestors`, and a
 * contradictory pair is a bug waiting for whichever browser prefers the
 * older header.
 */
export function securityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": `frame-ancestors ${options.frameAncestors}`,
    "Strict-Transport-Security": STRICT_TRANSPORT,
    "X-Content-Type-Options": "nosniff",
    /*
     * The origin and no more. A checkout URL can carry a page id and a
     * session, and sending the full path to every image host and script
     * origin the page loads from would hand them both away.
     */
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS,
  }

  if (options.frameAncestors === "'none'") headers["X-Frame-Options"] = "DENY"

  return headers
}
