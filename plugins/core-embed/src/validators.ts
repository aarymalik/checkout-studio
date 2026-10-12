import { collect } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"

/**
 * An embed must not share a section with the payment element.
 *
 * docs/component-library.md § Embed says so, and the reason is what an iframe
 * is next to a card field. A third party's frame beside the payment element is
 * a thing that looks like part of the form and is not: it can be sized,
 * positioned and styled by its own provider, and a customer cannot tell which
 * box belongs to whom. That is also the PCI argument — a payment page's
 * contents are meant to be inventoried, and a provider can change what is
 * inside their frame whenever they like.
 *
 * ## It names a type this plugin does not own
 *
 * `checkout.payment-element` belongs to the checkout plugin, which arrives in
 * Phase 13. A plugin may not import another plugin, and this one does not — it
 * matches a type id, which is a string in a document rather than code.
 *
 * The rule is written now rather than later because the components it is about
 * are being written now, and a rule added after the fact is a rule added to
 * documents that already break it. Until Phase 13 it is a validator that finds
 * nothing, which is the correct answer for a page that cannot yet contain a
 * payment element.
 *
 * ## An error, not a warning
 *
 * Heading order is a judgement about content and does not block a publish.
 * This does: the person publishing cannot see the risk, and the consequence
 * lands on somebody holding a card.
 */
export const EMBED_BESIDE_PAYMENT_RULE = "core-embed.embed-beside-payment"

const PAYMENT_ELEMENT = "checkout.payment-element"

/** The nearest Section a node sits in, or null if it is not inside one. */
function sectionOf(document: CheckoutSchema, node: Node): string | null {
  let current: Node | undefined = node

  while (current !== undefined) {
    if (current.type === "core.section") return current.id

    const parentId: string | null = current.parentId

    current = parentId === null ? undefined : document.nodes[parentId]
  }

  return null
}

export const embedBesidePayment: DocumentValidatorRegistration = {
  rule: EMBED_BESIDE_PAYMENT_RULE,
  label: "Embeds are kept away from the payment form",
  validate: (document) => {
    const nodes = [...collect(document)]
    const paymentSections = new Set(
      nodes
        .filter((node) => node.type === PAYMENT_ELEMENT)
        .map((node) => sectionOf(document, node))
        .filter((section): section is string => section !== null),
    )

    if (paymentSections.size === 0) return []

    const issues: ValidationIssue[] = []

    for (const node of nodes) {
      if (node.type !== "core.embed") continue

      const section = sectionOf(document, node)

      if (section === null || !paymentSections.has(section)) continue

      issues.push({
        rule: EMBED_BESIDE_PAYMENT_RULE,
        severity: "error",
        message:
          "This embed is in the same section as the payment form. A third party's frame beside a card field is a box a customer cannot tell apart from the form. Move it to its own section.",
        nodeIds: [node.id],
      })
    }

    return issues
  },
}
