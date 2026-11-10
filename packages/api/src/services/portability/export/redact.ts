import "server-only"

import type { BundlePayload } from "../types"

/**
 * The stage that makes a bundle safe to hand to a stranger.
 *
 * docs/export-import.md § Redaction on Export lists eleven things that are
 * never in a bundle, and requires this to be "an explicit pipeline stage with
 * its own test suite, not as a filter scattered through the collectors". It is
 * a stage and not a filter for a reason worth stating: a filter inside each
 * collector is correct only as long as every collector remembers it, and the
 * collector added next year is the one that forgets. A stage sees everything
 * on its way out, including from collectors that did not exist when it was
 * written.
 *
 * It runs before the checksum, because the checksum is of what travels.
 *
 * ## Two kinds of thing, two different answers
 *
 * A **tenant's own identifiers** — the project id, a user id, a tracking id,
 * a custom domain — are expected to be in our data and simply must not leave
 * it. Those are *removed*, by key, wherever they appear, and the result says
 * which paths were dropped so the export can tell the person what was left
 * out.
 *
 * A **credential** — a Stripe secret key, a webhook secret, a connection
 * string — must not be in the payload at all. Finding one means a collector
 * read something it had no business reading, and quietly stripping it would
 * export a clean file and leave the bug in place. Those *refuse* the export,
 * naming where they were found. The exit criterion is that no bundle has ever
 * contained a secret; the way to keep that true is for the stage that could
 * have let one through to stop instead of tidying up after it.
 *
 * ## Removal happens before anything is scanned
 *
 * So a removed key's value is never examined. `{ stripeAccountId: "acct_…" }`
 * is dropped rather than refused: it is gone, and there is nothing left to
 * object to. The same string loose in a heading *does* refuse, and the
 * difference is deliberate. In a configuration field a key is expected and
 * merely unwanted here; in page copy it means the page is wired to the
 * exporter's Stripe account, and carrying it to another installation would
 * send that installation's payments to the wrong place.
 *
 * ## An email address in page copy is page copy
 *
 * The spec's "email addresses" means the ones this product holds — a user
 * record, an author, a customer. A field *keyed* `email` is removed on that
 * reading, which also happens to be right for a template: nobody wants to
 * import a page that mails the author. Prose that happens to contain an
 * address is content, and a redactor that rewrote a merchant's copy would be
 * damaging the thing it was asked to export.
 *
 * ## It reports paths and never values
 *
 * A refusal is written to a log and shown in an interface. Naming the secret
 * it found would copy it somewhere new, which is the opposite of the job.
 */

/** Why a field was left out. Shown to the person exporting. */
export type RedactionReason =
  | "tenant-identifier"
  | "internal-identifier"
  | "personal-data"
  | "customer-record"
  | "analytics"
  | "domain-configuration"
  /** A credential-named key that held nothing. Never present, never refused. */
  | "credential"

export interface RedactedField {
  /** Where it was, as `document.nodes.n1.props.email`. Never its value. */
  path: string
  reason: RedactionReason
}

export type SecretKind =
  /** A Stripe key of any kind: secret, restricted or publishable. */
  | "stripe-key"
  | "stripe-account"
  | "webhook-secret"
  | "connection-string"
  /** A key whose name says it holds a credential, whatever the value looks like. */
  | "credential-field"

export interface FoundSecret {
  path: string
  kind: SecretKind
}

export type RedactionResult =
  | { ok: true; payload: BundlePayload; removed: RedactedField[] }
  | { ok: false; found: FoundSecret[] }

/**
 * Keys that are removed wherever they appear, at any depth.
 *
 * Normalized: compared lowercased and without `_` or `-`, so `userId`,
 * `user_id` and `USER-ID` are one entry. Specific on purpose — a list holding
 * `id` would strip every node in the document.
 *
 * `customers`, `orders` and `payments` are record collections, and they are
 * the three entries a component's props could one day want for themselves. A
 * prop would have to be named something else: a stage that can be negotiated
 * with over one component is not a stage.
 *
 * Exported because the test asserts the fixture covers every entry, which is
 * how a key added here without a fixture to prove it fails.
 */
export const REDACTED_KEYS: ReadonlyMap<string, RedactionReason> = new Map([
  ["projectid", "tenant-identifier"],
  ["tenantid", "tenant-identifier"],
  ["organizationid", "tenant-identifier"],
  ["orgid", "tenant-identifier"],
  ["stripeaccountid", "tenant-identifier"],
  ["publishablekey", "tenant-identifier"],
  ["stripepublishablekey", "tenant-identifier"],

  ["userid", "internal-identifier"],
  ["ownerid", "internal-identifier"],
  ["createdbyid", "internal-identifier"],
  ["updatedbyid", "internal-identifier"],
  ["databaseid", "internal-identifier"],

  ["email", "personal-data"],
  ["emailaddress", "personal-data"],

  ["customerid", "customer-record"],
  ["stripecustomerid", "customer-record"],
  ["orderid", "customer-record"],
  ["subscriptionid", "customer-record"],
  ["paymentintentid", "customer-record"],
  ["customers", "customer-record"],
  ["orders", "customer-record"],
  ["payments", "customer-record"],

  ["trackingid", "analytics"],
  ["measurementid", "analytics"],
  ["analyticsid", "analytics"],
  ["pixelid", "analytics"],
  ["gtmid", "analytics"],

  ["customdomain", "domain-configuration"],
  ["domain", "domain-configuration"],
  ["domains", "domain-configuration"],
])

/**
 * Keys that refuse the export when they hold anything.
 *
 * Deliberately without a bare `token`: a theme's manual overrides are token
 * paths, and a list that stopped every export of a themed page to protect
 * against a word would be read as a bug and removed by somebody in a hurry.
 */
export const REFUSED_KEYS: ReadonlySet<string> = new Set([
  "secret",
  "secretkey",
  "sessionsecret",
  "clientsecret",
  "webhooksecret",
  "webhooksigningsecret",
  "stripesecretkey",
  "apikey",
  "privatekey",
  "password",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
  "databaseurl",
  "redisurl",
  "connectionstring",
])

/**
 * Values that refuse the export wherever they appear, including inside prose.
 *
 * Shapes rather than entropy: a long random string is indistinguishable from
 * an id, but these prefixes mean exactly one thing.
 */
const SECRET_VALUES: readonly { kind: SecretKind; pattern: RegExp }[] = [
  // Secret, restricted and publishable alike — see the note on removal order.
  { kind: "stripe-key", pattern: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{4,}/ },
  { kind: "webhook-secret", pattern: /\bwhsec_[A-Za-z0-9]{8,}/ },
  { kind: "stripe-account", pattern: /\bacct_[A-Za-z0-9]{8,}/ },
  {
    kind: "connection-string",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?):\/\/\S+/,
  },
]

/** Everything a bundle may not carry, taken out of one before it is sealed. */
export function redact(payload: BundlePayload): RedactionResult {
  const removed: RedactedField[] = []
  const found: FoundSecret[] = []
  const walked = walk(payload, "", removed, found) as BundlePayload

  /*
   * Every secret, not the first one. A refusal that names one of three keys is
   * three refusals, and the person reading it fixes one collector per attempt.
   */
  return found.length > 0 ? { ok: false, found } : { ok: true, payload: walked, removed }
}

function walk(
  value: unknown,
  path: string,
  removed: RedactedField[],
  found: FoundSecret[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => walk(item, `${path}[${String(index)}]`, removed, found))
  }

  if (typeof value === "object" && value !== null) {
    return fields(value as Record<string, unknown>, path, removed, found)
  }

  if (typeof value === "string") {
    const match = SECRET_VALUES.find((candidate) => candidate.pattern.test(value))

    if (match !== undefined) found.push({ path, kind: match.kind })
  }

  return value
}

function fields(
  value: Record<string, unknown>,
  path: string,
  removed: RedactedField[],
  found: FoundSecret[],
): Record<string, unknown> {
  const kept: Record<string, unknown> = {}

  for (const [key, child] of Object.entries(value)) {
    const at = path === "" ? key : `${path}.${key}`
    const name = key.toLowerCase().replaceAll(/[_-]/gu, "")
    const reason = REDACTED_KEYS.get(name)

    if (reason !== undefined) {
      removed.push({ path: at, reason })

      continue
    }

    if (REFUSED_KEYS.has(name)) {
      /*
       * A credential-named key is never in the output: refused when it holds
       * something, dropped when it holds nothing. An unconfigured webhook is
       * not a leak, and stopping an export over an empty field would teach
       * people that the refusal means nothing.
       */
      if (child === null || child === undefined || child === "") {
        removed.push({ path: at, reason: "credential" })
      } else {
        found.push({ path: at, kind: "credential-field" })
      }

      continue
    }

    kept[key] = walk(child, at, removed, found)
  }

  return kept
}
