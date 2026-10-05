/**
 * Who this editing session is.
 *
 * Two things the lock needs: an id that tells this tab apart from every other
 * one, and a label a person can recognise in "this page is open in Chrome on
 * macOS". The label is for a human reading a prompt, so it is deliberately
 * coarse — a version number helps nobody decide whether to take over.
 *
 * See docs/history-versioning.md § Session Ownership.
 */

/**
 * A new session id.
 *
 * Per tab and per mount, not per user: two tabs are two sessions, and that is
 * the whole thing being detected. Not persisted anywhere — a reloaded tab is a
 * new session, and re-claiming refreshes the lock rather than failing against
 * the id the tab used to have.
 */
export function createSessionId(): string {
  // Available everywhere this runs, and the route requires 8 to 64 characters.
  return crypto.randomUUID()
}

const BROWSERS: readonly { label: string; match: RegExp }[] = [
  // Order matters. Every one of these also says "Chrome" or "Safari" about
  // itself, so the specific names have to be tried first.
  { label: "Edge", match: /\bEdg(?:e|A|iOS)?\// },
  { label: "Opera", match: /\bOPR\/|\bOpera\// },
  { label: "Samsung Internet", match: /\bSamsungBrowser\// },
  { label: "Firefox", match: /\bFirefox\/|\bFxiOS\// },
  { label: "Chrome", match: /\bChrome\/|\bCriOS\// },
  { label: "Safari", match: /\bSafari\// },
]

const PLATFORMS: readonly { label: string; match: RegExp }[] = [
  { label: "iPhone", match: /\biPhone\b/ },
  { label: "iPad", match: /\biPad\b/ },
  { label: "Android", match: /\bAndroid\b/ },
  { label: "macOS", match: /\bMac OS X\b|\bMacintosh\b/ },
  { label: "Windows", match: /\bWindows\b/ },
  { label: "Linux", match: /\bLinux\b|\bX11\b/ },
]

function firstMatch(
  candidates: readonly { label: string; match: RegExp }[],
  userAgent: string,
): string | null {
  return candidates.find((candidate) => candidate.match.test(userAgent))?.label ?? null
}

/**
 * A label for the takeover prompt: "Chrome on macOS".
 *
 * From the user agent, which is unreliable by design — so every part of this
 * degrades. An unrecognised browser on an unrecognised platform is still a
 * session somebody has to be told about, and "Another browser" says that
 * honestly where a parsed-wrong guess would not.
 */
export function describeClient(userAgent: string): string {
  const browser = firstMatch(BROWSERS, userAgent)
  const platform = firstMatch(PLATFORMS, userAgent)

  if (browser === null && platform === null) return "Another browser"
  if (browser === null) return `A browser on ${platform}`
  if (platform === null) return browser

  return `${browser} on ${platform}`
}
