# RFC 0001 — Agent-generated, embeddable checkout

**Status:** Draft

**Author:** Malik Arif

**Created:** 2026-11-20

**Affects:** `apps/studio`, `packages/editor`, `packages/api`, `packages/renderer`, new packages; `docs/roadmap.md`, `docs/phases.md`, `docs/product-spec.md`, `docs/ai-assistant.md`; phases 15–22

---

## Summary

Stop building a visual checkout builder as the product. Build an agent that generates a checkout from a description, an embed that puts it on any page on any platform, a dashboard that reports recovered revenue rather than listed orders, and a loop in which the agent proposes schema changes grounded in that checkout's own funnel data. The visual editor is demoted from the primary interface to the escape hatch. The engine — schema, renderer, API, database, design system, plugin SDK — is unchanged, because the builder was never the source of truth.

---

## Motivation

### The current plan builds the design surface deepest and the money surface shallowest

Phases 4 through 12 are the editor. Phases 13 and 18 — Stripe and analytics — are each one phase, and there is no phase at all for orders, refunds or customers.

That allocation is correct for a builder and wrong for a checkout product. A merchant does not buy a checkout because it was pleasant to lay out. They buy it because of what it does to revenue, and they stay because of what the dashboard tells them afterwards.

### Drag-and-drop as the primary interface is a commoditising category

The visual builder is no longer a reason to choose a product. It is an expectation of one, and the expectation is being met by generation.

### Generation alone is also commoditising

"Describe your checkout and we build it" is a prompt and a template corpus. Stripe or Shopify can ship it in a quarter, and will. A product whose whole claim is generation has a short window.

Generation is the right front door. It is not the product.

### What is actually defensible is already in this repository

The architecture separates the thing to drop from the things to keep:

```
Builder  →  JSON Schema  →  Renderer
```

The editor is one producer of schema. An agent is another. Nothing downstream of the schema knows or cares which one wrote it.

Three consequences follow, and each is unusual:

| Existing asset                                       | What it unlocks                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Strict schema, `parseDocument`, `validateReferences` | The agent proposes a validated **patch**; an invalid proposal is rejected before a merchant sees it |
| Immutable revisions and rollback (Phase 16)          | Changing a live checkout is safe and reversible in one click                                        |
| Renderer independent of the builder                  | Serving a variant costs nothing                                                                     |
| Embed on any platform                                | Conversion data across Webflow, WordPress, Shopify and custom stacks                                |
| Plugin architecture                                  | Upsells and order bumps ship without touching the core                                              |
| Export and import (Phase 15)                         | "Take your checkout and leave" is true, and is a credible anti-lock-in claim                        |

The last row in that table is the one competitors cannot reach. A platform-locked product sees one platform's behaviour. An optimisation tool layered over someone else's DOM cannot restructure a payment page safely. Stripe has the payments and no design surface, and has no incentive to optimise merchants away from its own Checkout.

A product that embeds everywhere sees all of it.

---

## Proposal

### Positioning

> A checkout that improves itself, on any platform, and shows you the money it recovered.

### 1. The agent becomes the front door

A merchant describes their business and their offer. The agent produces a complete, valid checkout document.

The agent emits **schema**, never React and never free-form markup. It is constrained to what the renderer and the design tokens can express. This is not a limitation to work around — it is what makes generated output safe to publish without a human reading it first.

Every generation and every proposal passes `parseDocument` and `validateReferences` before it is offered. A proposal that does not validate is discarded and regenerated, and the merchant never learns it existed.

### 2. The editor is demoted, not deleted

The agent lands most of a design. The remainder is where the merchant's brand lives, and re-prompting is a worse way to move a value than changing it directly.

Every generate-first product that shipped without an editor has since added one. We already have one. It stops being the main screen and becomes the escape hatch, reachable from any generated checkout.

`packages/editor`, `packages/ui` and the inspector continue. The studio shell becomes the dashboard shell.

### 3. The embed becomes the distribution model

Phase 16 already scopes an embed script and route. It is promoted from a feature to the way the product reaches a page.

Three surfaces:

```
Embed script    a tag on any page, on any platform
Hosted page     a URL, for merchants with nowhere to put it
Headless API    for teams who render their own front end
```

Card entry stays inside Stripe's own iframes in all three. That is what makes embedding on a third party's page acceptable rather than a PCI problem.

### 4. The dashboard reports recovered revenue

Orders, refunds and customers are built, and they are not the top of the screen. Every commerce product lists orders.

The dashboard leads with what is leaking and what to do about it:

```
£4,210 lost at the shipping step this week.
61% of drop-offs occur when the shipping cost first appears.
Proposed: move the estimate above the fold.
[ Preview ]  [ Apply ]
```

Analytics and operations are one surface, because a number a merchant cannot act on is a number they stop reading.

### 5. The loop

```
generate → publish → measure → propose → apply → measure
                        ▲                           │
                        └───────────────────────────┘
```

The agent's second week is worth more than its first. That is the whole retention argument, and it is the opposite of a generate-once tool.

**Proposals are never applied automatically.** Money flows through this surface, and a silent change that costs a merchant four percent is unrecoverable as a matter of trust, whatever it does to the average. One click to accept, one to revert, and an audit trail of every change: what it was, who approved it, and what happened to conversion afterwards.

Immutable revisions already give us the spine of that record.

### 6. Cross-platform benchmarks

Because the embed is platform-agnostic, aggregate behaviour across merchants becomes a number no platform-locked competitor can produce:

> Your checkout converts 2.1% below comparable stores at the shipping step.

This compounds. Every merchant improves the benchmark for the next one, and a new entrant starts with nothing.

It is also what rescues small merchants from the significance problem below: a merchant with 200 orders a month cannot A/B test their way to a conclusion, but they can be told where they sit against a thousand similar checkouts.

### What each existing package becomes

| Package                                                         | After this RFC                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `packages/schema`                                               | Unchanged. Now also the agent's output contract.               |
| `packages/renderer`                                             | Unchanged. Serves variants.                                    |
| `packages/database`, `packages/cache`, `packages/observability` | Unchanged.                                                     |
| `packages/design-system`                                        | Unchanged. Becomes the agent's constraint surface.             |
| `packages/plugin-sdk`, `plugins/*`                              | Unchanged. Upsells and bumps land here.                        |
| `packages/api`                                                  | Grows the agent, analytics, commerce and benchmark services.   |
| `packages/editor`, `packages/ui`, `packages/hooks`              | Kept. Repositioned as the escape hatch.                        |
| `apps/studio`                                                   | Shell becomes the dashboard. Canvas becomes a route within it. |
| `apps/renderer`                                                 | Grows the embed and the variant split.                         |

Nothing is deleted. The editor costs us its maintenance and nothing else, and it is the reason a merchant who dislikes a generated result stays rather than leaves.

### Revised phase order

| Was             | Becomes                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| 15 Templates    | 15 Templates — **finish as planned.** Templates become the agent's grounding corpus and its starting points.     |
| 16 Publishing   | 16 Publishing **and embed** — pull the embed forward; it is distribution now.                                    |
| 17 AI Assistant | 17 **Generation agent** — emits validated schema patches, not editor actions. Rewrite `docs/ai-assistant.md`.    |
| 18 Analytics    | 18 **Funnel instrumentation** — per-step events, because this is the loop's input, not a reporting afterthought. |
| —               | 19 **Commerce operations** — orders, refunds, customers, subscriptions. New.                                     |
| —               | 20 **The loop** — proposals, experiments, benchmarks. New.                                                       |
| 19–22           | Shift down. Performance, testing, release and enterprise are unaffected in substance.                            |

---

## Alternatives Considered

### Keep the builder primary and add AI as an assistant

This is Phase 17 exactly as currently written: an assistant in a sidebar that produces editor actions.

Rejected because it concedes the category. The product is then a builder with an AI feature, competing on builder quality against Framer and Webflow, who are better at it and always will be. It also leaves the measurement loop unbuilt, which is the part that is hard to copy.

### Pure generation, no editor at all

Cleaner story, smaller surface, and a louder pitch.

Rejected on evidence: every product that tried this added an editor later. The failure mode is specific — the agent is close but wrong in one place, and the only remedy on offer is to re-roll the whole thing. Merchants experience that as the product arguing with them.

We already own the editor. Deleting it to tell a tidier story would be paying to make the product worse.

### Become a merchant of record

Own the payment relationship, as Paddle and Lemon Squeezy do. Much larger revenue per merchant.

Rejected: that is a licensing, tax and compliance company wearing a product's clothes. It is a different business with a different funding profile, and it forecloses the embed-anywhere model because an MoR cannot sit quietly inside someone else's page.

### Ship VisualEngine as the product

Sell the generic visual editing platform; let others build the verticals.

Rejected for now, not forever. A platform with no proven vertical on it is a hard sell, and the checkout vertical is what will prove it. VisualEngine remains the internal engine, exactly as `CLAUDE.md` describes, and the plugin boundary stays honest so this option stays open.

### An optimisation layer over other people's checkouts

Skip rendering entirely; be the A/B and analytics layer on Shopify, Stripe and WooCommerce checkouts.

Rejected on capability: you cannot safely restructure a payment page you do not own, which limits you to cosmetic tests. It is also a crowded space with incumbents. Owning the rendering is what makes a structural proposal possible at all.

---

## Migration

Nothing shipped so far is discarded.

**Documents and projects.** The schema does not change. Existing pages, drafts and revisions are untouched.

**Templates.** Phase 15's library becomes the agent's corpus. The install path built in #177 and #178 is how a generated checkout is materialised as a page, unchanged.

**Published pages.** Unaffected. The embed is an additional delivery surface beside the hosted route, not a replacement for it.

**The editor.** Stays reachable. No merchant loses a capability.

**Documentation.** `docs/roadmap.md` needs a new vision section; `docs/phases.md` needs the reordering above and two new phases; `docs/ai-assistant.md` needs rewriting around schema patches rather than editor actions; `docs/product-spec.md` needs the positioning. These are a follow-up to this RFC, not part of it.

---

## Risks

### Statistical significance at low volume

A merchant doing 200 orders a month cannot reach significance on a layout test, and a product that reports confidence it has not earned will be found out.

**Response:** network-wide priors as the starting belief; sequential testing rather than fixed-horizon; explicit "not yet conclusive" states; and benchmarks rather than per-merchant experiments below a volume threshold. The cross-platform dataset is what makes this honest instead of embarrassing.

### Cold start

Benchmarks need merchants, and the loop needs traffic. Early customers get generation, embed and dashboard, and the loop arrives as data accumulates.

**Response:** sequence the pitch truthfully. Do not sell the loop before it has data behind it.

### Trust in an agent that touches a payment page

A merchant who believes the product changed their checkout without asking will not stay, and will say so publicly.

**Response:** propose-only, one-click apply, one-click revert, and a complete audit trail. No automatic application of anything, ever, including changes the model is confident about.

### The agent emitting unusable output

A generated document that fails validation, or renders as something nobody would ship.

**Response:** validation before presentation, constrained to the design tokens and the registered component set. A proposal that fails is regenerated silently. This is cheap because the schema is already strict.

### Embedding on third-party domains

`docs/security.md` sets a CSP that rejects unknown sources. That policy was written for our own domain and does not survive contact with embedding on arbitrary customer domains.

**Response:** a separate RFC on the embed's security model before Phase 16 ships it. Frame ancestors, per-merchant origin allowlists, and what the embed may read from its host page are all decisions, not details.

### Scope

Commerce operations is a large phase being added to a plan that is already long.

**Response:** orders, refunds and customers first; subscriptions and disputes later. Link out to Stripe for payouts and dispute handling rather than rebuilding its dashboard.

---

## Open Questions

1. **Who installs the embed?** A developer pasting a script tag, or a non-technical merchant on Shopify or WordPress? The second answer means platform apps and app-store review, which is a large amount of work and belongs in the phase plan if it is true.

2. **What is the pricing surface?** `docs/pricing-billing.md` was written for a builder. Per-merchant, per-transaction and per-recovered-revenue are three different companies.

3. **Does the loop need a traffic floor to be offered at all?** Showing proposals to a merchant whose data cannot support them is the fastest way to lose the trust the whole model depends on.

4. **Which model provider, and where does the abstraction sit?** Phase 17 as written requires a provider abstraction with no vendor SDK outside it. That requirement should survive this rewrite.

5. **Is the benchmark opt-in?** Aggregating behaviour across merchants has a privacy posture that `docs/security.md` does not currently describe.
