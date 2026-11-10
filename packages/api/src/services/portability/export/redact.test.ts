import { describe, expect, it } from "vitest"

import { REDACTED_KEYS, REFUSED_KEYS, redact } from "./redact"
import type { RedactionResult } from "./redact"
import type { BundlePayload } from "../types"

/**
 * The fixture docs/export-import.md asks for.
 *
 * The exit criterion is "no bundle has ever contained a secret, proven against
 * the full fixture", so the fixtures below hold every key the policy names and
 * every value shape it recognizes — and the first test asserts that, so a key
 * added to the policy without a fixture entry fails here rather than passing
 * untested.
 *
 * Every forbidden value contains `LEAK`. That turns the exit criterion into
 * one assertion over the serialized output: if the word survives, something
 * the bundle may not carry is in it.
 */

const LEAK = "LEAK"

/** Keys that are removed. Spellings vary, because the policy normalizes them. */
const REMOVABLE: BundlePayload = {
  page: {
    name: "Checkout",
    slug: "checkout",
    "project-id": "prj_LEAK01",
    USER_ID: "usr_LEAK02",
    ownerId: "usr_LEAK03",
    createdById: "usr_LEAK04",
    updatedById: "usr_LEAK05",
    databaseId: "row_LEAK06",
  },
  account: {
    tenantId: "tnt_LEAK07",
    organizationId: "org_LEAK08",
    orgId: "org_LEAK09",
    // Also a value the policy would refuse. Removal happens first.
    stripeAccountId: "acct_LEAK0010",
    publishableKey: "pk_live_LEAK0011",
    stripePublishableKey: "pk_test_LEAK0012",
    email: "owner-LEAK13@example.test",
    emailAddress: "billing-LEAK14@example.test",
  },
  records: {
    customerId: "cus_LEAK15",
    stripeCustomerId: "cus_LEAK16",
    orderId: "ord_LEAK17",
    subscriptionId: "sub_LEAK18",
    paymentIntentId: "pi_LEAK19",
    customers: [{ name: "LEAK20" }],
    orders: [{ total: "LEAK21" }],
    payments: [{ amount: "LEAK22" }],
  },
  settings: {
    customDomain: "shop-LEAK23.example",
    domain: "LEAK24.example",
    domains: ["LEAK25.example"],
    integrations: [
      { kind: "google-analytics", measurementId: "G-LEAK26" },
      { kind: "google-tag-manager", gtmId: "GTM-LEAK27" },
      { kind: "facebook", pixelId: "LEAK28" },
      { kind: "other", trackingId: "UA-LEAK29-1", analyticsId: "LEAK30" },
    ],
  },
  document: {
    version: "1.0.0",
    root: "root",
    nodes: {
      root: { id: "root", type: "core.page", children: ["contact"] },
      contact: {
        id: "contact",
        type: "core.text",
        props: { text: "Questions? Write to us.", email: "support-LEAK31@example.test" },
      },
    },
  },
}

/** Keys whose names say they hold a credential. Every one refuses. */
const CREDENTIALS: BundlePayload = {
  stripe: {
    secret: "LEAK-secret",
    secretKey: "sk_live_LEAK01",
    stripeSecretKey: "sk_live_LEAK02",
    clientSecret: "LEAK-client",
    webhookSecret: "whsec_LEAK0003",
    webhook_signing_secret: "whsec_LEAK0004",
    apiKey: "LEAK-api",
  },
  server: {
    sessionSecret: "LEAK-session",
    privateKey: "LEAK-private",
    password: "LEAK-password",
    passwordHash: "LEAK-hash",
    accessToken: "LEAK-access",
    refreshToken: "LEAK-refresh",
    DATABASE_URL: "postgres://user:LEAK@db.example/app",
    REDIS_URL: "redis://LEAK@cache.example:6379",
    connectionString: "mysql://user:LEAK@db.example/app",
  },
}

/** Secrets loose in content, under keys the policy has no opinion about. */
const LOOSE: BundlePayload = {
  document: {
    nodes: {
      a: { props: { html: "<script>Stripe('pk_live_LEAKaaaa')</script>" } },
      b: { props: { text: "our key is sk_test_LEAKbbbb" } },
      c: { props: { text: "restricted rk_live_LEAKcccc" } },
      d: { props: { note: "whsec_LEAKdddddddd" } },
      e: { props: { note: "acct_LEAKeeeeeeee" } },
      f: { props: { items: ["postgresql://user:LEAK@db.example/app"] } },
    },
  },
}

/** A page with nothing to hide, which must come out the other side untouched. */
const INNOCENT: BundlePayload = {
  document: {
    version: "1.0.0",
    root: "root",
    nodes: {
      root: { id: "root", type: "core.page", children: ["copy"], styles: {} },
      copy: {
        id: "copy",
        type: "core.text",
        props: { text: "Pay securely. Questions? support@example.test", level: 2, bold: true },
      },
    },
  },
  theme: { id: "theme_default", name: "Default", manual: ["colors.primary"] },
}

function keysOf(value: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, into)
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      into.add(key.toLowerCase().replaceAll(/[_-]/gu, ""))
      keysOf(child, into)
    }
  }

  return into
}

function kept(result: RedactionResult): BundlePayload {
  if (!result.ok) throw new Error(`Expected the export to be allowed: ${JSON.stringify(result)}`)

  return result.payload
}

function refusal(result: RedactionResult): { path: string; kind: string }[] {
  if (result.ok) throw new Error("Expected the export to be refused.")

  return result.found
}

describe("the fixture", () => {
  it("holds every key the policy names", () => {
    /*
     * Not a behaviour: the completeness the exit criterion asks for. A key
     * added to either table with nothing to exercise it would otherwise be a
     * rule nobody has ever seen work.
     */
    const present = keysOf(REMOVABLE, keysOf(CREDENTIALS, new Set<string>()))

    expect([...REDACTED_KEYS.keys()].filter((key) => !present.has(key))).toEqual([])
    expect([...REFUSED_KEYS].filter((key) => !present.has(key))).toEqual([])
  })
})

describe("what a bundle never carries", () => {
  it("has none of it left in the output", () => {
    // The phase's exit criterion, as one assertion over the bytes that travel.
    expect(JSON.stringify(kept(redact(REMOVABLE)))).not.toContain(LEAK)
  })

  it("says where each dropped field was, and what kind of thing it was", () => {
    const result = redact(REMOVABLE)

    if (result.ok === false) throw new Error("Expected the export to be allowed.")

    expect(result.removed).toContainEqual({ path: "page.project-id", reason: "tenant-identifier" })
    expect(result.removed).toContainEqual({ path: "page.USER_ID", reason: "internal-identifier" })
    expect(result.removed).toContainEqual({ path: "records.orders", reason: "customer-record" })
    expect(result.removed).toContainEqual({
      path: "settings.integrations[0].measurementId",
      reason: "analytics",
    })
    expect(result.removed).toContainEqual({
      path: "document.nodes.contact.props.email",
      reason: "personal-data",
    })
    expect(result.removed).toContainEqual({
      path: "settings.domains",
      reason: "domain-configuration",
    })
    // Thirty keys, and `email` in two places.
    expect(result.removed).toHaveLength(31)
  })

  it("leaves everything around it where it was", () => {
    /*
     * The failure this guards against is a redactor that protects the tenant
     * by exporting an empty page. What is removed is named; what is not named
     * is the thing somebody asked to export.
     */
    expect(kept(redact(REMOVABLE))["document"]).toEqual({
      version: "1.0.0",
      root: "root",
      nodes: {
        root: { id: "root", type: "core.page", children: ["contact"] },
        contact: {
          id: "contact",
          type: "core.text",
          props: { text: "Questions? Write to us." },
        },
      },
    })
    expect(kept(redact(REMOVABLE))["settings"]).toEqual({
      integrations: [
        { kind: "google-analytics" },
        { kind: "google-tag-manager" },
        { kind: "facebook" },
        { kind: "other" },
      ],
    })
  })

  it("names paths and never values", () => {
    // A refusal is written to a log. Quoting the secret copies it somewhere new.
    expect(JSON.stringify(refusal(redact(CREDENTIALS)))).not.toContain(LEAK)
  })

  it("does not touch what it was given", () => {
    const before = JSON.stringify(REMOVABLE)

    redact(REMOVABLE)

    expect(JSON.stringify(REMOVABLE)).toBe(before)
  })
})

describe("a credential refuses the export", () => {
  it("rather than being quietly stripped", () => {
    /*
     * A secret in the payload means a collector read something it had no
     * business reading. Removing it would export a clean file and leave the
     * bug in place, and the next collector would make the same mistake.
     */
    const found = refusal(redact(CREDENTIALS))

    expect(found).toContainEqual({ path: "stripe.secretKey", kind: "credential-field" })
    expect(found).toContainEqual({ path: "server.sessionSecret", kind: "credential-field" })
    expect(found).toContainEqual({ path: "server.DATABASE_URL", kind: "credential-field" })
    expect(found).toHaveLength(16)
  })

  it("naming every one of them, not the first", () => {
    // One refusal per attempt would mean one collector fixed per attempt.
    expect(refusal(redact({ a: { apiKey: "LEAK" }, b: { password: "LEAK" } }))).toHaveLength(2)
  })

  it("and hands back no payload at all", () => {
    expect("payload" in redact(CREDENTIALS)).toBe(false)
  })

  it.each([
    ["document.nodes.a.props.html", "stripe-key"],
    ["document.nodes.b.props.text", "stripe-key"],
    ["document.nodes.c.props.text", "stripe-key"],
    ["document.nodes.d.props.note", "webhook-secret"],
    ["document.nodes.e.props.note", "stripe-account"],
    ["document.nodes.f.props.items[0]", "connection-string"],
  ])("when it is loose in content at %s", (path, kind) => {
    expect(refusal(redact(LOOSE))).toContainEqual({ path, kind })
  })

  it.each([
    "mongodb+srv://user:LEAK@cluster.example/app",
    "rediss://LEAK@cache.example:6380",
    "postgres://user:LEAK@db.example:5432/app",
  ])("in any connection string: %s", (value) => {
    expect(refusal(redact({ note: value }))).toEqual([{ path: "note", kind: "connection-string" }])
  })

  it("even when something else in the bundle was merely removable", () => {
    expect(redact({ ...REMOVABLE, ...CREDENTIALS }).ok).toBe(false)
  })
})

describe("the order the two rules run in", () => {
  it("removes a key the policy knows rather than refusing its value", () => {
    /*
     * `acct_…` under `stripeAccountId` is expected and simply unwanted here,
     * so it is dropped — and once dropped there is nothing to object to. The
     * same string in a heading refuses, because a page wired to the exporter's
     * Stripe account would take the importer's payments to the wrong place.
     */
    const result = redact({ stripeAccountId: "acct_LEAK0001" })

    expect(result).toEqual({
      ok: true,
      payload: {},
      removed: [{ path: "stripeAccountId", reason: "tenant-identifier" }],
    })
    expect(redact({ heading: "acct_LEAK0001" }).ok).toBe(false)
  })

  it.each([null, undefined, ""])("drops an unconfigured credential field: %s", (value) => {
    // An empty webhook secret is not a leak, and an export stopped over one
    // would teach people that the refusal means nothing.
    expect(redact({ webhookSecret: value })).toEqual({
      ok: true,
      payload: {},
      removed: [{ path: "webhookSecret", reason: "credential" }],
    })
  })
})

describe("a page with nothing to hide", () => {
  it("comes out exactly as it went in", () => {
    expect(redact(INNOCENT)).toEqual({ ok: true, payload: INNOCENT, removed: [] })
  })

  it("keeps an address a merchant wrote into their own copy", () => {
    /*
     * The spec's "email addresses" are the ones this product holds. Rewriting
     * a merchant's prose would damage the thing it was asked to export, and a
     * support address on a checkout page is the page.
     */
    expect(JSON.stringify(kept(redact(INNOCENT)))).toContain("support@example.test")
  })

  it("keeps values that are not strings", () => {
    const payload = { counts: [0, 1], flag: false, missing: null, nested: { depth: 2 } }

    expect(kept(redact(payload))).toEqual(payload)
  })
})
