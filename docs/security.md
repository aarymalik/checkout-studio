# Checkout Studio Security Specification

**Version:** 1.0

**Status:** Security Architecture

---

# Overview

Security is a core architectural requirement of Checkout Studio.

Every feature must be designed with the assumption that it will be exposed to the public internet and may process sensitive customer information.

The platform follows a "Secure by Default" philosophy.

---

# Security Principles

Every component must follow these principles.

- Least Privilege
- Defense in Depth
- Secure by Default
- Zero Trust
- Fail Securely
- Encrypt Everything
- Never Trust Client Input
- Validate Everything
- Audit Sensitive Operations

---

# Authentication

Authentication is ours. We hold the credentials, the sessions and the tokens.

This reverses an earlier decision to use a hosted identity provider, and it is
worth being clear about what that costs: authentication is the area where a bug
is both catastrophic and silent. A session that does not expire, a reset link
that can be used twice, a token compared without constant time — none of these
fail a test, and each one is somebody else's account.

So the requirements below are not preferences. They are the reason owning this
is defensible at all, and a review that lets one through has not been a review.

Requirements

- Email and password, with verified email addresses
- Passwords hashed with Argon2id, never with a general-purpose hash
- Sessions held in the database, so any one of them can be ended
- Single-use, short-lived, hashed tokens for verification and password reset
- Rate limiting on every credential-accepting route
- Identical responses whether or not an account exists

Deferred, and deliberately: federated sign-in and multi-factor authentication.
Both extend this model rather than reshaping it — an OAuthAccount table and an
MfaCredential table, alongside what is here.

Not deferred, and never acceptable: rolling our own password hash, storing a
token we could read, or letting a failure message say whether an email is
registered.

---

# Authorization

Every request must verify ownership.

Example

User

↓

Project

↓

Page

↓

Revision

↓

Checkout

A user may never access another user's resources.

---

# Roles

Supported roles

Owner

Administrator

Editor

Viewer

Future

Organization Admin

Support Agent

---

# Permissions

Examples

Owner

- Everything

Administrator

- Everything except billing (see [pricing-billing.md](./pricing-billing.md))

Editor

- Edit projects
- Publish
- Create templates

Viewer

- Read only

---

# Session Security

A session is a row, not a signed claim.

The distinction is what makes "sign out everywhere" possible, and what makes a
stolen cookie recoverable: a token that carries its own authority is valid until
it expires no matter what we learn about it in the meantime.

Sessions must

- Expire automatically, and be revocable before they do
- Be rotated when privilege changes — a sign-in, a password change
- Be invalidated in bulk when a password changes, except the one that changed it
- Be visible to the person they belong to: device, location, last used
- Store only a hash of the token, so the database cannot be replayed

Cookies

- HttpOnly
- Secure
- SameSite=Lax
- No session identifier in a URL, ever, where it would reach logs and referrers

---

# Passwords

Passwords are hashed with Argon2id and never stored in any other form.

Argon2id rather than bcrypt: it resists GPU and ASIC attack through memory cost,
which is the attack a leaked table actually faces. Parameters are chosen to take
roughly 250ms on production hardware and are raised as hardware improves; the
hash records the parameters it was made with, so an old password is rehashed on
the next successful sign-in rather than being left behind.

Rules

- No maximum length below 64 characters, and no composition rules: length beats
  punctuation, and a rule that forbids a passphrase makes things worse
- Checked against a list of known-breached passwords on the way in
- Never logged, never in an error, never in a URL — the redaction rules in
  observability.md already drop anything named like one
- A password change ends every other session

Passwords are compared in constant time. A comparison that returns early leaks
the answer one character at a time.

---

# API Security

Every API route must

Authenticate

↓

Authorize

↓

Validate

↓

Execute

↓

Return sanitized response

Never expose internal errors.

---

# Input Validation

Every request must use Zod.

Never trust

- Query Parameters
- Request Body
- Headers
- Cookies

Validation occurs before business logic.

---

# SQL Injection

Prevented by

- Prisma ORM
- Parameterized Queries

Never use raw SQL unless absolutely required.

---

# XSS Protection

Escape all user content.

Never render unsanitized HTML.

Rich text must be sanitized.

Content Security Policy should prevent inline script execution.

---

# CSRF Protection

Server Actions

Route Handlers

Forms

must validate origin.

Sensitive actions require CSRF protection.

---

# Content Security Policy

Default Policy

- self

Two policies, because the two applications load different things.

Studio (`apps/studio`)

- Stripe (Connect onboarding, Billing Customer Portal)
- Resend (transactional email only; it never sees a credential)
- UploadThing
- Sentry, PostHog

Published checkouts (`apps/renderer`)

- Stripe (`js.stripe.com`, `api.stripe.com`, and Stripe's iframe origins)
- The origins of the tracking integrations the page actually enables, and no others
- Our asset CDN

Fonts are self-hosted on both, so no font origin is allowed.

Framework scripts carry a per-request nonce. No other inline script is permitted.

Reject unknown sources.

---

# Clickjacking

Enable

X-Frame-Options

```
DENY
```

Exception

Published checkout pages served on the `embed/[id]` route may be framed, and only by the hostnames the merchant registered for that embed, via `Content-Security-Policy: frame-ancestors`. Every other route keeps `DENY`. See **Embed Mode** in [renderer.md](./renderer.md).

---

# Scripts on Checkout Pages

A checkout page contains a payment form.

Any script running on that page could observe or alter it.

Merchant-supplied JavaScript is therefore never executed.

Rules

- The schema never contains executable code.
- The renderer never evaluates schema content, per [renderer.md](./renderer.md).
- Tracking is provided through first-class integrations (Google Analytics 4, Meta Pixel, TikTok Pixel, LinkedIn Insight), configured as data and loaded from each provider's allowlisted origin.
- Google Tag Manager is **not** offered. A GTM container is configured by the merchant and can inject arbitrary tags and scripts from any origin, so allowlisting its origin would reopen exactly the hole this policy closes.
- Every script origin on a published checkout is enumerated in its Content Security Policy.
- Third-party widgets render only inside sandboxed iframes.
- HTML Block and Code Block content is sanitized; `<script>`, event handler attributes, and `javascript:` URLs are removed.

This is also a PCI requirement.

PCI DSS v4 requires that every script on a payment page be inventoried, authorized, and integrity-checked. An allowlisted set of integrations satisfies that. Arbitrary merchant code cannot.

See [stripe-integration.md](./stripe-integration.md).

---

# Security Headers

Always send

- Strict-Transport-Security
- Content-Security-Policy
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- X-Frame-Options

---

# HTTPS

HTTPS is mandatory.

HTTP redirects automatically.

TLS 1.2+

---

# Encryption

Encryption in Transit

HTTPS

Encryption at Rest

Database encryption

Encrypted backups

Encrypted storage

---

# Secrets

Never commit

.env

Secrets include

- Stripe Keys
- Session signing secret
- Resend API key
- Database URL
- Redis URL
- UploadThing Keys

Production secrets managed by hosting provider.

---

# Stripe Security

The complete payment architecture is defined in [stripe-integration.md](./stripe-integration.md).

Never store

- Card Numbers
- CVV
- Expiration Dates

Payments handled exclusively by Stripe Elements.

Server verifies

- PaymentIntent
- Webhook Signature

Never trust payment success from the browser.

---

# Webhook Verification

Every webhook must verify

Stripe Signature

↓

Timestamp

↓

Event Type

↓

Replay Protection

Ignore invalid events.

---

# Rate Limiting

Apply rate limits to

Authentication

Publishing

Checkout creation

API endpoints

Public forms

Webhooks are **not** rate limited. They are authenticated by signature instead, and a rate limit could drop legitimate events during a burst. Concrete limits for public checkout endpoints are in [stripe-integration.md](./stripe-integration.md).

Redis should be used.

---

# Brute Force Protection

Protect

Login

Magic Links

Password Reset

API Tokens

---

# Bot Protection

Future

Cloudflare Turnstile

or

Google reCAPTCHA Enterprise

Only protect endpoints that require it.

---

# File Upload Security

Archive hardening and bundle sanitization for imports are defined in [export-import.md](./export-import.md).

Allowed

Images

SVG (sanitized)

Videos

Fonts (validated by magic bytes)

PDF

Maximum size

Configurable — a ceiling per kind, defaulting to 10 MB for an image, 1 MB for an
SVG, 100 MB for a video, 2 MB for a font and 20 MB for a PDF. These are not a
quota: a plan's `storageBytes` is a separate refusal, made by `assertCan`
against what the project already holds.

Scan uploads before serving.

Reject executable files.

**Decided from the bytes, never from the request.** `inspectUpload` identifies a
type by the signature at the front of the file, and takes no declared content
type at all — a client-supplied media type is precisely the value that must not
be trusted, and a parameter holding one would be a parameter somebody later
believes. The type recorded against an asset is always the one that matched.

An allowlist, so rejecting executables follows from it rather than needing a
list of executable formats: ELF, PE, Mach-O, a shebang script, a zip and a
Windows shortcut are all refused as unrecognised, without being named.

**A filename is a label, not a path.** A name carrying a separator, a traversal,
a control character or a newline is refused rather than rewritten, so a merchant
sees the name they chose or an error and never a third thing we invented. It
matters less than it looks — the stored object's key comes from the content hash
— but the name is shown to people and read later by code nobody has written yet.

**Identical bytes are stored once.** The sha256 of the content is the
deduplication key, and `Asset` is unique on `(projectId, sha256)`. For a type
that gets rewritten the hash is of the stored file, not of the upload — so two
uploads of the same drawing deduplicate even when one of them carried a script,
and two exports of the same photograph deduplicate even though their EXIF
differs.

## SVG

An uploaded SVG is not filtered and stored. It is read into a tree of
allowlisted elements and escaped text, and a new document is written from that
tree. What is stored is markup we produced, so a construct outside the allowlist
has nowhere to be rather than being removed.

The emitter is the security boundary, not the parser. A parsing mistake can
misread a shape or reject a file that was fine; it cannot produce an element or
attribute the emitter does not know how to write, and it cannot put unescaped
text into the output.

The parser refuses rather than guesses, because leniency is what bypasses are
made of. No DOCTYPE (entity expansion and XXE), no CDATA, no processing
instruction but the XML declaration, no unquoted attribute value, no entity
outside the five XML predefines and numeric ones, and no tags that do not nest.

Allowed: paths, the basic shapes, groups, gradients, clipping and masking — what
a logo or an icon is made of. Refused, each for its own reason:

- `script`, and every `on*` attribute.
- `style`, and the `style` attribute. CSS in SVG carries `url()` and `@import`,
  so allowing it means a CSS parser inside the trust boundary.
- `foreignObject`, whose content is HTML.
- `filter` and its primitives — a large surface a logo does not need, and
  `feImage` fetches.
- `animate`, `set`, `animateTransform`, `animateMotion`. An animation can target
  `href`, which would make checking that attribute at rest meaningless.
- `image` and `text`. Both reference another origin, which a published
  checkout's CSP refuses.

`href` and `xlink:href` must be a fragment, and a paint's `url()` must point
into the same document, so nothing reaches another origin.

The element drop list is matched without regard to case while the allowlist is
matched exactly. The asymmetry is deliberate: SVG's own names are camel case, so
`lineargradient` is not `linearGradient` — but an exact match on the drop list
would let `<SCRIPT>` through as an unknown element whose children are kept,
which is inert in an XML parse and a script in an HTML one. Our own bytes should
not depend on which parser later reads them.

What was removed is reported rather than dropped silently. A logo that lost a
`<filter>` will not look the way it was exported, and only the person who
exported it can fix that.

---

# Image Security

Strip metadata.

Optimize automatically.

Reject malformed images.

An uploaded raster is decoded and encoded again, and what gets stored is the
encoder's output. Metadata could have been removed by rewriting the container —
drop the EXIF segment from a JPEG, keep only a PNG's critical chunks — and
everything else in the file would still be bytes a stranger wrote. Re-encoding
is the same bargain the SVG sanitizer makes: the emitter is the boundary. It is
also why rejecting a malformed image is not a separate check, because a file
that cannot be decoded cannot be encoded again.

The five raster signatures in `@checkout-studio/utils` are the only inputs that
reach a decoder, and `rasterEncoder` is the list of them. In particular an SVG
never does: libvips renders one through the librsvg named in the `sharp` row of
the override table below, and a vector is identified, refused and answered by
our own sanitizer long before this. The advisory is in the binary and
unreachable from it.

## What a stored image does not carry

EXIF, and with it the camera, its serial number and the coordinates of wherever
the photograph was taken. XMP, IPTC, and the orientation tag. libvips writes
none of them unless asked, and nothing asks.

Two exceptions, both because the alternative is a picture that does not look
like the one the merchant uploaded. The EXIF orientation is applied to the
pixels before the tag is dropped — stripping metadata without it would turn
every phone photograph that displayed upright into one lying on its side, the
metadata gone and the image wrong, which is worse than either. And the ICC
colour profile is carried over: libvips does not convert colourspaces on its
own, so dropping a Display P3 profile leaves wide-gamut values to be read as
sRGB and every such upload arrives oversaturated. A profile describes how to
read colours and names no person, place or device owner, so keeping it gives up
none of the privacy the rest of this is for. It is the only part of an upload
that reaches the stored file unexamined.

## A ceiling on pixels, not only on bytes

The size ceiling bounds the compressed file, which says nothing about the cost
of decoding it: a few kilobytes of PNG can describe twenty thousand pixels
squared, and a decoder asks for four bytes a pixel to find out. Fifty
megapixels is the ceiling — about 200 MB of decoded image, five times below
libvips' own default and comfortably above anything a camera produces.

An animation is measured across every frame, because it is read as one tall
strip. So the ceiling bounds the work rather than the frame.

## Refuse, don't guess

A truncated file is refused rather than stored as whichever half of the picture
decoded. A file a decoder merely complains about is accepted — real export
tools produce JPEGs libjpeg objects to and every browser renders, and the
objection does not survive the re-encoding anyway.

An upload keeps the format its signature named. Deriving WebP and AVIF
renditions is done from the stored master and not to it, so a lossless format
stays lossless, a lossy one is re-encoded at a quality chosen to be invisible
rather than to save bytes, and the generational loss happens exactly once.

Because the hash is of the stored file, two exports of the same photograph
carrying different EXIF deduplicate to one row.

A video, a font and a PDF are stored as they arrived. We decode none of them,
so there is no encoder whose output could stand in for the upload, and
rewriting a file we cannot read would be guessing.

---

# CORS

Only allow trusted origins.

Never use

```
Access-Control-Allow-Origin: *
```

for authenticated APIs.

---

# Error Handling

See [error-handling.md](./error-handling.md).

Never expose

Stack traces

Database schema

SQL queries

Internal paths

Return generic messages.

Log detailed errors internally.

---

# Logging

The log record shape, redaction, and retention policy are defined in [observability.md](./observability.md).

Log

Authentication

Publishing

Orders

Stripe Events

API Errors

Permission Changes

Never log

Passwords

Tokens

Payment Details

Personal Information

---

# Audit Log

Track

Login

Publish

Delete

Restore

Billing Changes

Role Changes

API Key Creation

Audit logs are immutable and retained for 7 years (`AuditLog` in [database.md](./database.md)).

---

# Backup Security

Backups

Encrypted

Versioned

Access Controlled

Retention

30 Days

---

# Dependency Security

Weekly dependency updates.

Run

```
pnpm audit
```

before releases.

Replace vulnerable packages immediately.

CI blocks on high and critical advisories, so a vulnerability in anything the
workspace resolves stops the build rather than waiting for someone to run the
audit.

## Resolution overrides

Most advisories arrive in a package we do not depend on and cannot upgrade: it
is a transitive dependency of a framework, and the framework's own range already
allows the patched version while the lockfile is pinned below it. `pnpm.overrides`
in the root `package.json` raises the floor.

Each one is here because an advisory made it necessary, and each is written as a
minimum rather than an exact version so ordinary updates are not blocked by it.
Remove an entry only when nothing in the tree resolves below the floor any more
— at which point the override is inert and `pnpm audit` will stay quiet without
it.

| Override        | Floor      | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mysql2`        | `>=3.23.1` | Reaches us only through the Prisma CLI — a driver this project never loads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `deepmerge-ts`  | `>=8.0.0`  | Likewise through the Prisma CLI, in its config loader.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `source-map-js` | `>=1.2.2`  | GHSA-68fv-2mgg-jv7q — event-loop denial of service in versions below 1.2.2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `sharp`         | `>=0.35.5` | GHSA-wq5f-xc86-pv6w / CVE-2026-96889 — a flaw in the bundled librsvg. `@checkout-studio/api` now depends on sharp directly, to re-encode uploaded rasters, and it reaches us through Next's optional image-optimisation dependency as well; both ranges already allowed the fix. The override moves the lockfile to it, and with it `@img/sharp-libvips-*` from 1.3.3 to 1.3.4, which is where the patch actually lives. Nothing in the asset pipeline hands a vector to libvips, so librsvg is present and unreached — see § Image Security. |

---

# Supply Chain Security

Pin package versions.

Verify package integrity.

Review new dependencies before installation.

---

# Secure Coding Rules

Never use eval()

Never use Function()

Never use dangerouslySetInnerHTML unless sanitized.

Never trust client state.

Never expose secrets to the client.

---

# Accessibility & Security

Security features must remain accessible.

Examples

Keyboard navigation

Screen readers

Focus management

Accessible authentication flows

---

# Security Testing

Automated checks

- Dependency Audit
- Type Checking
- ESLint
- Unit Tests

Manual testing

- Authorization
- Permission Escalation
- Broken Access Control
- Payment Flow
- Session Management

---

# Incident Response

Detect

↓

Log

↓

Notify

↓

Contain

↓

Recover

↓

Postmortem

---

# Recovery Objectives

Maximum downtime

30 minutes

Maximum data loss

15 minutes

---

# Security Review Checklist

Before every release

✓ Authentication verified

✓ Authorization verified

✓ Secrets protected

✓ HTTPS enabled

✓ CSP validated

✓ Stripe webhook verification working

✓ Input validation complete

✓ Rate limiting enabled

✓ Logging enabled

✓ Dependency audit clean

✓ No high severity vulnerabilities

---

# Security Philosophy

Security is not a feature.

Security is part of every feature.

Every line of code should reduce risk, not introduce it.
