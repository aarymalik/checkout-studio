# RFC 0002 — Embed security model

**Status:** Draft

**Author:** Malik Arif

**Created:** 2026-11-20

**Affects:** `apps/renderer`, `packages/api`, `packages/database`; `docs/security.md`, `docs/renderer.md`, `docs/stripe-integration.md`; Phase 16

---

## Summary

[RFC 0001](./0001-agent-generated-embeddable-checkout.md) promotes the embed from a feature to the way the product reaches a page. The shape of it is already decided — a loader script, a cross-origin iframe, `frame-ancestors` scoped to hostnames the merchant registered, `allow="payment"` for wallets. What is not decided is everything that determines whether it works in a real browser on a real merchant's domain: who may frame a checkout and how that list is established, the `postMessage` channel between the two frames, storage in a partitioned third-party context, permission delegation through two levels of framing, and what a merchant sees when any of it fails. This RFC settles those.

---

## Motivation

### The decisions already made are the easy half

`docs/security.md` § Clickjacking and `docs/renderer.md` § Embed Mode already establish the architecture:

```
merchant page  →  embed.js  →  <iframe> → our embed/[id] route → Stripe's iframes
```

The checkout never renders into the merchant's DOM. Their scripts cannot read the payment form. Our CSP governs the page that contains it. `X-Frame-Options: DENY` stays on every other route. None of that is reopened here.

### The unmade decisions are where embeds actually break

Each of the following is unspecified today, and each is either a vulnerability or a support queue:

1. **Who may frame a checkout, expressed how.** "Hostnames the merchant registered" is a sentence, not a format. Wildcards, apex-versus-`www`, ports, and localhost all decide themselves by accident if nobody decides them on purpose.
2. **The `postMessage` channel.** Resizing requires one. An embed that accepts messages without checking their origin is the classic embed vulnerability, and the mistake is made by default rather than by choice.
3. **Storage in a partitioned context.** Our iframe is third-party on the merchant's page. Safari has blocked that storage for years and Chrome partitions it. Nothing in the specs acknowledges this, and it is the most likely cause of an embed that works in development and fails on a customer's site.
4. **Permission delegation through two frame levels.** `allow="payment"` on the outer iframe delegates to us. It does not reach Stripe's iframes inside us, and `docs/security.md` requires a `Permissions-Policy` header on every response that could switch the feature off before it gets there.
5. **The failure mode.** A frame blocked by `frame-ancestors` renders nothing. The browser logs to a console the merchant is not reading. This will be the single largest source of "the embed doesn't work" with no further detail.

### Why it needs an RFC rather than a pull request

A published embed's security posture is a contract with every page that already carries it. Tightening the allowlist format after merchants have registered domains breaks live checkouts; loosening it later is easy. The asymmetry is the whole argument for deciding first.

---

## Proposal

### 1. The allowlist is per embed, and holds exact origins

Registered against the embed, not the account. A merchant running a storefront and a members' area should not have one leak framing rights to the other.

Each entry is a full origin — scheme, host, and port if non-default:

```
https://shop.example.com
https://example.com
```

**HTTPS only.** An `http:` origin cannot host a payment page.

**Apex and `www` are paired automatically.** Registering one offers the other, because every merchant means both and discovering otherwise takes a support ticket.

**No wildcards in v1.** `frame-ancestors` accepts `*.example.com`, and it is the wrong default: `*.myshopify.com` would let any Shopify store frame that merchant's checkout. Merchants who genuinely need many subdomains are an open question below, not a default.

**A cap of 20 origins per embed**, raised on request. A list that grows without bound is a list nobody is auditing.

**`http://localhost` is permitted only on a development embed**, which refuses live payment and is visibly marked as test mode in the rendered page. Development convenience must not be reachable from a production checkout id.

### 2. Domain ownership rides on Stripe's verification, not a second system

A merchant could register a domain they do not own. The direct harm is small — it lets that domain frame _their_ checkout — but the allowlist stops being evidence of anything, which matters when it is the control standing between a checkout and a clickjacking attempt.

We do not build a verification system. **Apple Pay already requires the host domain to be registered as a payment method domain on the connected account**, which Stripe verifies with a well-known file, and `docs/renderer.md` § Embed Mode already says embed setup collects and registers it.

So: one file, two purposes. A domain is _verified_ when Stripe's payment method domain verification passes for it. An unverified domain may be registered and will frame, but wallets are off and the embed setup screen says why. That makes verification something the merchant wants rather than something we impose.

### 3. The `postMessage` channel is a defined protocol

Versioned, schema-validated, and origin-checked in both directions.

```
iframe → host     embed:ready       { version, embedId }
                  embed:resize      { height }
                  embed:completed   { }
                  embed:failed      { code }

host → iframe     embed:ack         { version }
```

Rules:

- **The iframe validates `event.origin` against the registered allowlist** before acting on any message, and ignores the rest silently. Silently, because an error reply is a probe oracle.
- **The loader validates `event.origin` equals our renderer origin**, which it knows because it constructed the URL.
- **`targetOrigin` is never `"*"`**, in either direction.
- **Payloads are validated with the same Zod schemas used elsewhere.** An unparseable message is dropped.
- **No message carries PII, an amount, or anything about the customer.** `embed:completed` says a checkout finished; it does not say by whom or for how much. The merchant learns both from their own server through the webhook, which is the only path that is trustworthy anyway.

The host-to-iframe direction deliberately holds almost nothing. Every field added there is a field an attacker on the merchant's page can set.

### 4. Nothing about money comes from the client

The embed id appears in public HTML and is **not a secret**. Treat it as published, because it is.

Therefore: line items, amounts, currency, discounts and tax are resolved **server-side** from the checkout session. The embed id selects a checkout; it never carries a price. No parameter on the loader tag, and no `postMessage` field, may influence what is charged.

Session creation is rate limited per embed and per IP, because the endpoint is public by construction.

### 5. Storage is partitioned, and the design assumes it

Our iframe is a third-party context. Safari's ITP blocks its storage outright; Chrome partitions it per top-level site.

- **The checkout session does not live in a cookie.** It is established in the frame URL at load and carried in memory for the life of the frame.
- **Any cookie we do set is `Partitioned; Secure; SameSite=None`** (CHIPS), and nothing may depend on it surviving. A partitioned cookie is per-merchant-site by definition, which is the correct scope for an embed anyway.
- **No feature may require the Storage Access API.** A prompt asking a shopper to grant tracking access on a payment page is worse than the feature it buys.

Stripe's own iframes manage their own state and are unaffected by our choices here.

### 6. Permission delegation is a chain, and `Permissions-Policy` can break it

Three links, all required for wallets:

1. The merchant's page delegates to us: `allow="payment"` on the iframe the loader creates. The loader does this.
2. **Our embed document's `Permissions-Policy` response header must not disable `payment`.** `docs/security.md` requires the header on every response; if its value is restrictive, wallets fail inside the embed and the cause is three layers away from the symptom. The `embed/[id]` route needs `payment=(self "https://js.stripe.com")` rather than the default.
3. Stripe.js delegates to its own frames. Nothing for us to do beyond not interfering.

Link 2 is the one that will be got wrong, because it is a header we already send for good reasons and the failure looks like a Stripe problem.

### 7. Failure is diagnosable

A frame blocked by `frame-ancestors` is a blank box. The browser reports it to a console nobody has open.

- **The loader waits for `embed:ready` and, on timeout, renders a visible styled message** in the space the iframe would occupy: that this domain is not registered for this checkout, and which domain to register. It names the origin it was loaded from, so the merchant can copy it.
- **A CSP `report-to` endpoint collects `frame-ancestors` violations**, so support sees the mismatch before the merchant reports it, and so we can tell a merchant which domain their customers are actually loading from.
- Reports are rate limited and carry no visitor data beyond the blocked origin.

### 8. What does not change

- "Reject unknown sources" still governs the embed document itself. The change here is `frame-ancestors`, which is about who may frame us, not about what we may load.
- No merchant JavaScript, inside the frame or out. The PCI argument in `docs/security.md` § Scripts on Checkout Pages is untouched.
- `X-Frame-Options: DENY` on every route but `embed/[id]`.
- The merchant's host page stays in the merchant's own PCI scope, since a script there can overlay the iframe. Embed setup already states this and must keep stating it.

### 9. The loader script

`embed.js` does one job and must stay auditable: create the iframe, handle resize, report failure. No dependencies.

Served from a versioned immutable URL with an SRI hash, and a stable alias for merchants who want fixes without editing their page. The alias cannot carry SRI — that is a real tradeoff, documented at the point the merchant chooses, not buried.

---

## Alternatives Considered

### A web component rendering into the merchant's DOM

Better integration, no resize channel, no partitioned storage problem.

Rejected on the only ground that matters: any script on the merchant's page — including every analytics tag they have installed — could read the card fields, overlay them, or log keystrokes. It also drags the merchant's whole page into PCI scope in a way that embedding does not. This is why Stripe's own Elements are iframes.

### Hosted redirect only, no embed

Send the shopper to a page we control. No framing, no allowlist, no partitioned storage.

Rejected as _the only option_, kept as _an option_. A redirect is Stripe Checkout, and competing with it on its own ground is a losing position. Embedding in the merchant's page is the differentiator RFC 0001 rests on. We ship both; the embed is the default.

### Wildcard subdomains by default

Fewer support tickets at setup.

Rejected: `*.myshopify.com`, `*.vercel.app` and `*.squarespace.com` are each a single entry that grants framing rights to every tenant of a shared platform. The convenience is real and the blast radius is the entire platform.

### `frame-ancestors *` with an origin check in JavaScript

Let anyone frame it; have the embed check `document.referrer` or `location.ancestorOrigins` and refuse.

Rejected because it does not work. By the time our JavaScript runs, the page is already framed and rendered, and the attacker controls when they read it. Framing is a header-level control or it is nothing.

### Our own domain-verification system

DNS TXT records or a well-known file of our own.

Rejected as a second system doing a job Stripe's payment method domain verification already does for the same domains, on the same accounts, for a requirement we cannot avoid anyway. Two verification flows for one fact is an onboarding step merchants would rightly resent.

---

## Migration

Nothing is published yet, so this is greenfield — which is the reason to decide it now rather than after merchants have embedded.

**`docs/security.md`** § Clickjacking gains the allowlist format and the `Permissions-Policy` exception for `embed/[id]`. Its existing exception sentence stays and gains a link here.

**`docs/renderer.md`** § Embed Mode gains the `postMessage` protocol and the failure behaviour. The architecture described there is unchanged.

**`docs/stripe-integration.md`** gains the note that payment method domain verification is also what marks an allowlist entry verified.

**`docs/phases.md`** Phase 16 gains the allowlist model, the protocol and the report endpoint in its scope. The phase does not grow a dependency it did not have.

**`packages/database`** gains the per-embed origin list. No existing table changes.

---

## Risks

### Partitioned storage rules keep moving

Chrome's third-party cookie plans have changed more than once, and Safari's behaviour is its own.

**Response:** depend on none of it. The design above works with storage fully blocked, which is the only assumption that cannot be invalidated by a browser release.

### Merchants on platforms that forbid a script tag

Shopify, Wix and some WordPress configurations restrict what a merchant may add to a page, and the well-known file for domain verification may be unreachable on a platform subdomain.

**Response:** this is RFC 0001's first open question, and it decides whether platform apps are in scope. The embed security model does not change either way — the installation path does. Flagged, not solved here.

### An allowlist strict enough to be safe is strict enough to annoy

Every blank-box support ticket is a cost, and the temptation will be to loosen the format.

**Response:** section 7 exists for exactly this. The failure must name the unregistered origin and the fix, or the pressure to allow wildcards becomes irresistible for the wrong reason.

### Wallets inside a nested cross-origin frame

Apple Pay and Google Pay in an iframe within an iframe is the configuration most likely to behave differently across browsers.

**Response:** it must be tested on real Safari, on a real third-party domain, before Phase 16 ships — not in a local harness where everything is same-origin and nothing is partitioned. This belongs in the phase's exit criteria.

### CSP report volume

A public endpoint accepting browser-generated reports is a free amplification target.

**Response:** rate limited, size capped, and the endpoint stores a blocked origin and nothing else.

---

## Open Questions

1. **Do merchants with many subdomains get wildcards at all?** A franchise with fifty store subdomains is a real case and twenty exact origins will not hold it. If yes, the question is whether wildcards are restricted to domains verified through Stripe, which would at least prove the apex is theirs.

2. **Who may edit the allowlist?** It is the control preventing a checkout being framed anywhere. Any project member, or owners only — and either way the change needs an audit entry naming who made it.

3. **Is a development embed worth building?** It solves a real problem — nobody develops against production — but it is a second code path through a payment surface, which is exactly where second code paths are expensive.

4. **More than one embedded checkout on a page?** Upsell flows suggest yes eventually. It affects the `postMessage` protocol, which would need to address a specific frame rather than broadcast, and that is cheaper to decide now than to retrofit.

5. **What does `embed:completed` trigger on the merchant's page?** Merchants will want a redirect or a thank-you state. Anything we offer there is an instruction from inside our frame to code on theirs, and it needs its own threat model before we offer it.
