import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { ShippingSelectorRenderer } from "./Renderer"
import { SHIPPING_STYLES } from "./styles"

/**
 * Shipping Selector's registration.
 *
 * `interactive: true`: choosing a method changes the cart, and the methods
 * themselves arrive with a quote that lands after the page does.
 *
 * `defaultProps` carries only words. The methods and their prices are the
 * server's — a merchant control that listed them would be a control that
 * sets a price.
 */
export const shippingSelector: ComponentDefinition = {
  type: "checkout.shipping-selector",
  name: "Shipping Selector",
  category: "Checkout",
  interactive: true,
  container: false,
  defaultProps: { label: "Delivery", freeLabel: "Free" },
  defaultStyles: { display: "block", width: "100%", borderWidth: "0", padding: "0", margin: "0" },
  descendantStyles: SHIPPING_STYLES,
  renderer: ShippingSelectorRenderer,
}
