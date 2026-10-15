/**
 * Where a checkout gets its numbers.
 *
 * ## The seam, and why it is an interface rather than a function
 *
 * docs/stripe-integration.md: "every amount is computed on the server, from
 * the published schema, every time." Nothing in this plugin adds a price, and
 * nothing here knows how the server works out a total — it asks, and shows
 * what it is told.
 *
 * The provider depends on this type and never on an implementation. Phase 13
 * delivers the real one, which talks to the pricing engine; the tests here use
 * an in-memory one. That is not a convenience: it is what lets the components
 * be finished and checked before a single Stripe call exists, and it is why
 * this phase can be reviewed on its own.
 *
 * ## Inputs go up, amounts come down
 *
 * A request carries *selections* — which products, how many, which coupon code
 * somebody typed. It never carries an amount. A browser that could send a
 * total is a browser that can choose one.
 */

export interface CartItem {
  /** The node that put this in the cart, which is how the server prices it. */
  nodeId: string
  quantity: number
}

export interface Selections {
  items: readonly CartItem[]
  /** The node ids of accepted order bumps. */
  bumps: readonly string[]
  couponCode?: string
  shippingMethodId?: string
}

export type QuoteLineKind = "product" | "bump" | "shipping" | "discount" | "tax"

export interface QuoteLineItem {
  nodeId: string
  kind: QuoteLineKind
  label: string
  quantity: number
  /** Minor units. See money.ts. */
  unitAmount: number
  amount: number
}

/**
 * A way of getting the order to somebody, and what it costs.
 *
 * ## Why this is on the quote and not in a merchant's props
 *
 * A Shipping Selector has to offer choices with prices against them, and a
 * price a component holds is a price the browser could change. What is
 * available depends on the cart and the address as well — a method that fits
 * one order does not fit the next — so it cannot be decided when the page is
 * built, only when the cart is priced.
 *
 * This extends the Quote in docs/stripe-integration.md, which describes the
 * shipping *total* but never what the customer chose it from. Recorded there.
 */
export interface ShippingMethod {
  id: string
  label: string
  /** Minor units. See money.ts. */
  amount: number
  /** "Arrives Tuesday", or whatever else is worth knowing. */
  description?: string
}

/** Something the customer should see, which does not stop them paying. */
export interface QuoteNotice {
  code: string
  message: string
}

export interface Quote {
  quoteId: string
  /** Signed by the server, so it cannot be altered between quote and payment. */
  signature: string
  expiresAt: string

  currency: string
  lineItems: readonly QuoteLineItem[]

  subtotal: number
  discount: number
  shipping: number
  tax: number
  total: number

  /**
   * What the customer may choose between, when the server offers a choice.
   *
   * Absent rather than empty when there is nothing to choose — a page with no
   * shipping at all should not have to carry an empty list to say so.
   */
  shippingMethods?: readonly ShippingMethod[]
  /**
   * Which method this quote was priced with.
   *
   * The server's answer rather than the browser's: a selector that marked a
   * method chosen because somebody clicked it would show a choice that the
   * total beside it had not been told about yet.
   */
  shippingMethodId?: string

  notices: readonly QuoteNotice[]
}

/** Why a quote could not be produced, in words a customer can read. */
export interface QuoteProblem {
  code: "unavailable" | "coupon-rejected" | "expired" | "unknown"
  message: string
  /** Which coupon was refused, when that is what happened. */
  couponCode?: string
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; problem: QuoteProblem }

export interface CheckoutDataSource {
  /**
   * Prices a set of selections.
   *
   * Called for every change that could move a number — a quantity, a bump, a
   * coupon, a shipping method — because the server is the only thing that
   * knows what any of them are worth. A component that adjusted a total itself
   * would be guessing, and the guess would be the number somebody pays.
   */
  quote(selections: Selections, signal?: AbortSignal): Promise<QuoteResult>
}
