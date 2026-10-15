/**
 * The checkout, as a plugin.
 *
 * The engine knows nothing about carts, coupons or totals. It knows a plugin
 * may put a provider around the tree and register components — which is the
 * whole of what this needs, and the reason a landing-page product built on the
 * same engine ships without this plugin and loses nothing.
 */

export { manifest } from "./manifest"
export type {
  CartItem,
  CheckoutDataSource,
  Quote,
  QuoteLineItem,
  QuoteLineKind,
  QuoteNotice,
  QuoteProblem,
  QuoteResult,
  Selections,
  ShippingMethod,
} from "./checkout/source"
