/**
 * Redaction.
 *
 * Structural, not a regex over free text: fields are redacted by name before
 * anything is serialised. A scrubber that runs over the finished string is a
 * second line of defence, not a first one.
 *
 * See docs/observability.md.
 */

/**
 * Any key CONTAINING one of these is dropped.
 *
 * Substring matching rather than exact: STRIPE_SECRET_KEY, clerkSecretKey and
 * webhookSecret must all be caught, and no list of exact names stays complete.
 * Redaction fails safe — over-redacting costs a debugging session, under-
 * redacting costs a disclosure.
 */
const DROP_IF_CONTAINS = [
  "password",
  "passwd",
  "token",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "credential",
  "privatekey",
  "cardnumber",
  "cvc",
  "cvv",
  "iban",
  "ssn",
  "clientsecret",
]

/** Personal data with no diagnostic value. Matched exactly. */
const DROP_EXACT = new Set(["phone", "name", "fullname", "firstname", "lastname", "address"])

const HASH = new Set(["email", "customeremail", "useremail"])

const TRUNCATE_IP = new Set(["ip", "ipaddress", "remoteaddr", "clientip"])

export const REDACTED = "[redacted]"

/** Stable and one-way: joins remain possible, identity does not. */
export function hashValue(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `h_${hash.toString(16).padStart(8, "0")}`
}

/** IPv4 to /24, IPv6 to /48 — enough to locate, not enough to identify. */
export function truncateIp(ip: string): string {
  if (ip.includes(":")) {
    return `${ip.split(":").slice(0, 3).join(":")}::/48`
  }
  const octets = ip.split(".")
  return octets.length === 4 ? `${octets.slice(0, 3).join(".")}.0/24` : REDACTED
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (typeof value !== "object") return value

  const output: Record<string, unknown> = {}

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    // Strip separators so stripe_secret_key, stripeSecretKey and
    // STRIPE-SECRET-KEY all normalise to the same thing.
    const normalized = key.toLowerCase().replaceAll(/[^a-z]/g, "")

    if (
      DROP_IF_CONTAINS.some((needle) => normalized.includes(needle)) ||
      DROP_EXACT.has(normalized)
    ) {
      output[key] = REDACTED
    } else if (HASH.has(normalized) && typeof item === "string") {
      output[key] = hashValue(item)
    } else if (TRUNCATE_IP.has(normalized) && typeof item === "string") {
      output[key] = truncateIp(item)
    } else if (typeof item === "object" && item !== null) {
      output[key] = redact(item, depth + 1)
    } else {
      output[key] = item
    }
  }

  return output
}
