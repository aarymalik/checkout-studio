import { collect } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"

/**
 * What a checkout page has to have, and what it should not have twice.
 *
 * These are document rules because no node can answer them alone: whether a
 * coupon field is the only one, and whether anything on the page is for sale,
 * are both facts about the page.
 *
 * ## Why one of these is an error and the others are warnings
 *
 * The line is whether a customer could be misled or stuck, not whether the
 * merchant made a mistake.
 *
 * A control that changes a cart which cannot exist is **broken**: a Coupon on a
 * page with nothing to discount accepts a code and applies it to nothing, and
 * an Order Bump offers to add something to an order nobody can place. That
 * blocks publishing.
 *
 * A component that merely *displays* a total — Order Summary, Tax Summary —
 * is not broken by the absence of a product. It says the order is empty, which
 * is true. It is a page the merchant probably did not mean to publish, so it
 * is a **warning**: worth stopping to look at, not worth refusing.
 */

const PRODUCT = "checkout.product-card"

/**
 * Components that act on a cart.
 *
 * Each of these sends something to the pricing engine or changes what is in
 * the order. With nothing for sale on the page, each is a control wired to
 * nothing.
 */
const NEEDS_A_PRODUCT: ReadonlySet<string> = new Set([
  "checkout.coupon",
  "checkout.order-bump",
  "checkout.shipping-selector",
])

/** Components that only show what the server said. */
const SHOWS_A_TOTAL: ReadonlySet<string> = new Set([
  "checkout.order-summary",
  "checkout.tax-summary",
])

function nodesOf(document: CheckoutSchema, types: ReadonlySet<string>): readonly Node[] {
  return [...collect(document)].filter((node) => types.has(node.type))
}

function hasProduct(document: CheckoutSchema): boolean {
  for (const node of collect(document)) {
    if (node.type === PRODUCT) return true
  }

  return false
}

/** Plain English for a list of component names. */
function listed(nodes: readonly Node[]): string {
  const names = [...new Set(nodes.map((node) => node.type.replace("checkout.", "")))].sort()

  return names.join(", ")
}

export const CART_WITHOUT_PRODUCT_RULE = "checkout.cart-without-product"

export const cartWithoutProduct: DocumentValidatorRegistration = {
  rule: CART_WITHOUT_PRODUCT_RULE,
  label: "Anything that changes an order has an order to change",
  validate: (document) => {
    const acting = nodesOf(document, NEEDS_A_PRODUCT)

    if (acting.length === 0 || hasProduct(document)) return []

    const issue: ValidationIssue = {
      rule: CART_WITHOUT_PRODUCT_RULE,
      severity: "error",
      message: `This page has nothing for sale, so ${listed(acting)} would change an order nobody can place. Add a Product Card.`,
      nodeIds: acting.map((node) => node.id),
    }

    return [issue]
  },
}

export const TOTAL_WITHOUT_PRODUCT_RULE = "checkout.total-without-product"

export const totalWithoutProduct: DocumentValidatorRegistration = {
  rule: TOTAL_WITHOUT_PRODUCT_RULE,
  label: "Anything that shows a total has something to total",
  validate: (document) => {
    const showing = nodesOf(document, SHOWS_A_TOTAL)

    if (showing.length === 0 || hasProduct(document)) return []

    /*
     * A warning rather than an error. The page is not broken — a summary with
     * an empty cart says the order is empty, which is true — but it is almost
     * certainly not what the merchant meant to publish.
     */
    const issue: ValidationIssue = {
      rule: TOTAL_WITHOUT_PRODUCT_RULE,
      severity: "warning",
      message: `This page has nothing for sale, so ${listed(showing)} will tell a customer their order is empty.`,
      nodeIds: showing.map((node) => node.id),
    }

    return [issue]
  },
}

export const DUPLICATE_COUPON_RULE = "checkout.duplicate-coupon"

export const duplicateCoupon: DocumentValidatorRegistration = {
  rule: DUPLICATE_COUPON_RULE,
  label: "One coupon field to a page",
  validate: (document) => {
    const fields = nodesOf(document, new Set(["checkout.coupon"]))

    if (fields.length < 2) return []

    /*
     * Both write the same code into the same selections, so the second
     * silently replaces the first — a customer who types into one and then
     * the other sees one of the two fields apparently do nothing. A warning:
     * the page works, and which field somebody meant to keep is theirs to say.
     */
    const issue: ValidationIssue = {
      rule: DUPLICATE_COUPON_RULE,
      severity: "warning",
      message: `There are ${String(fields.length)} coupon fields on this page. They share one code, so only the last one used has any effect.`,
      nodeIds: fields.map((node) => node.id),
    }

    return [issue]
  },
}

export const checkoutValidators: readonly DocumentValidatorRegistration[] = [
  cartWithoutProduct,
  totalWithoutProduct,
  duplicateCoupon,
]
