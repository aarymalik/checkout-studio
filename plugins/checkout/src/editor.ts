import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { orderSummaryProperties } from "./components/order-summary/properties"
import { trustBadgesProperties } from "./components/trust-badges/properties"
import { guaranteeBoxProperties } from "./components/guarantee-box/properties"
import { shippingSelectorProperties } from "./components/shipping-selector/properties"
import { taxSummaryProperties } from "./components/tax-summary/properties"
import { orderBumpProperties } from "./components/order-bump/properties"
import { couponProperties } from "./components/coupon/properties"
import { productCardProperties } from "./components/product-card/properties"
import { productListProperties } from "./components/product-list/properties"

/** The editor half: property definitions, read by the inspector in Phase 12. */
export const checkoutProperties: ReadonlyMap<string, readonly PropertyDefinition[]> = new Map([
  ["checkout.product-card", productCardProperties],
  ["checkout.product-list", productListProperties],
  ["checkout.order-summary", orderSummaryProperties],
  ["checkout.coupon", couponProperties],
  ["checkout.order-bump", orderBumpProperties],
  ["checkout.shipping-selector", shippingSelectorProperties],
  ["checkout.tax-summary", taxSummaryProperties],
  ["checkout.trust-badges", trustBadgesProperties],
  ["checkout.guarantee-box", guaranteeBoxProperties],
])
