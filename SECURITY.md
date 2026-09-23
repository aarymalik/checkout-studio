# Security Policy

## Reporting a vulnerability

**Do not open a public issue.**

Email **security@checkoutstudio.com** with:

- A description of the issue
- Steps to reproduce
- The impact you believe it has
- Any suggested fix

You will receive an acknowledgement within 24 hours and an assessment within 72 hours.

Responsible disclosure is credited in the release notes, with your permission.

## Supported versions

| Version | Supported       |
| ------- | --------------- |
| 0.1.x   | ✓ (pre-release) |

## Scope

This repository contains the platform itself. Of particular interest:

- Authentication and authorization, including any cross-tenant access
- Payment handling: amount integrity, webhook verification, order creation
- The import pipeline, which accepts untrusted archives
- Anything that could place third-party JavaScript on a page that handles payments

## What we do

The security architecture — the trust boundaries, the payment model, and the rules
about scripts on checkout pages — is documented in
[docs/security.md](./docs/security.md) and
[docs/stripe-integration.md](./docs/stripe-integration.md).

Card data never reaches our systems: payment details are entered directly into
Stripe-hosted iframes. We store no merchant Stripe secret keys.
