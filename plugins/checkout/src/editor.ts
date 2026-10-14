import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { orderSummaryProperties } from "./components/order-summary/properties"

/** The editor half: property definitions, read by the inspector in Phase 12. */
export const checkoutProperties: ReadonlyMap<string, readonly PropertyDefinition[]> = new Map([
  ["checkout.order-summary", orderSummaryProperties],
])
