/**
 * A destination, checked before it reaches the page.
 *
 * ## Why this exists
 *
 * `href="javascript:…"` runs that script when somebody clicks it. A document
 * is data — it arrives from the database, from an import, from a template, and
 * in a workspace from another person — so a URL in one is untrusted input, and
 * putting it into an anchor unchecked is cross-site scripting with extra steps.
 * On a page taking card details that is the whole game.
 *
 * docs/security.md § Content Security says `javascript:` URLs are stripped
 * from HTML and Code blocks. The same reasoning applies to an anchor a user
 * typed a destination into; this is where that happens for Button and Link.
 *
 * ## What is allowed
 *
 * The four schemes a checkout has a reason to link to, and relative paths.
 * `data:` is not among them: a `data:text/html` link opens a page the author
 * wrote in an origin the browser treats as ours.
 *
 * Anything else yields null, and the component renders something that is not a
 * link rather than a link that goes somewhere unexpected — a destination that
 * silently does nothing is recoverable, and one that runs a script is not.
 */
const SCHEMES = ["http:", "https:", "mailto:", "tel:"]

export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null

  const href = value.trim()

  if (href === "") return null

  /*
   * A protocol-relative URL, refused — and not because of its scheme.
   *
   * `//evil.example/pay` resolves to `https://evil.example/pay`, so the check
   * below would pass it: it is an ordinary cross-origin https link, which is
   * allowed when written as one. The problem is that it does not look like
   * one. In a page builder, somebody typing a path has typed a path, and a
   * destination that silently means another site because of a doubled slash
   * is a trap with no upside — `https://` is six characters away, and
   * protocol-relative URLs stopped being useful when mixed-scheme pages did.
   *
   * My own test found this: the first version let it through while claiming
   * in its comment to catch it.
   */
  if (href.startsWith("//")) return null

  // A relative path, a fragment or a query has no scheme to check.
  if (/^[/#?]/.test(href)) return href

  try {
    // A base, so a relative URL parses rather than throwing. Only the scheme
    // of the result is read, which is what the check is about.
    return SCHEMES.includes(new URL(href, "https://checkout.invalid").protocol) ? href : null
  } catch {
    return null
  }
}

/**
 * What a link to another site needs beyond its address.
 *
 * `noopener` because a page opened with `target="_blank"` can otherwise reach
 * back through `window.opener` and navigate the page that opened it — reverse
 * tabnabbing, and the page it would be replacing is a checkout. `noreferrer`
 * because the address of a customer's checkout is not another site's business.
 */
export function relFor(target: unknown): string | undefined {
  return target === "_blank" ? "noopener noreferrer" : undefined
}
