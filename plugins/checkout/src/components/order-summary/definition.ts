import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { OrderSummaryRenderer } from "./Renderer"
import { SUMMARY_STYLES } from "./styles"

/**
 * Order Summary's registration.
 *
 * `interactive: true`: it reads a quote that arrives after the page does, and
 * changes when the cart does. Nothing else about it needs a client — there is
 * no state here beyond what the provider holds.
 */
export const orderSummary: ComponentDefinition = {
  type: "checkout.order-summary",
  name: "Order Summary",
  category: "Checkout",
  interactive: true,
  container: false,
  defaultProps: { hideZeroLines: true },
  defaultStyles: { display: "block", width: "100%" },
  descendantStyles: SUMMARY_STYLES,
  renderer: OrderSummaryRenderer,
}
