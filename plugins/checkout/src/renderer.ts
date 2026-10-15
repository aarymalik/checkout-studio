import type { Plugin, PluginApi } from "@checkout-studio/plugin-sdk"

import { manifest } from "./manifest"
import { orderSummary } from "./components/order-summary/definition"
import { shippingSelector } from "./components/shipping-selector/definition"
import { taxSummary } from "./components/tax-summary/definition"
import { orderBump } from "./components/order-bump/definition"
import { coupon } from "./components/coupon/definition"
import { productCard } from "./components/product-card/definition"
import { productList } from "./components/product-list/definition"

/**
 * The renderer half.
 *
 * The provider is **not** registered here, and that is the one unusual thing
 * about this plugin. A checkout provider needs a data source, and a data
 * source is a property of the application doing the rendering rather than of
 * the plugin — the published app will supply the one that talks to the pricing
 * engine in Phase 13, and the tests supply one that answers from memory.
 *
 * `CheckoutProvider` is exported for whoever has one. Registering it through
 * `api.registerProvider` needs a source to hand it, and there is nothing
 * sensible to default to: a checkout with a made-up source would show made-up
 * prices.
 */
export const checkout: Plugin = {
  manifest,
  activate(api: PluginApi) {
    api.registerComponent(productCard)
    api.registerComponent(productList)
    api.registerComponent(orderSummary)
    api.registerComponent(coupon)
    api.registerComponent(orderBump)
    api.registerComponent(shippingSelector)
    api.registerComponent(taxSummary)
  },
}

export { productCard, productList, orderSummary, coupon, orderBump, shippingSelector, taxSummary }
export { CheckoutProvider, useCheckout } from "./checkout/CheckoutProvider"
export type { CheckoutProviderProps, CheckoutState } from "./checkout/CheckoutProvider"
export { formatMoney } from "./checkout/money"
