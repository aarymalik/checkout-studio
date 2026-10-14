import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { OrderBumpRenderer } from "./Renderer"
import { BUMP_STYLES } from "./styles"

/**
 * Order Bump's registration.
 *
 * `interactive: true`: somebody ticks it, and the cart changes.
 *
 * Unlike a Product Card it registers nothing on mount. A bump that nobody has
 * accepted is not in the cart — that is what makes it an offer rather than a
 * product — so it appears in `selections.bumps` only when it is ticked.
 */
export const orderBump: ComponentDefinition = {
  type: "checkout.order-bump",
  name: "Order Bump",
  category: "Checkout",
  interactive: true,
  container: false,
  defaultProps: {
    title: "Add gift wrapping",
    description: "Presented in a box with a ribbon.",
    badge: "One-time offer",
    price: 499,
    currency: "GBP",
  },
  defaultStyles: { display: "block", width: "100%" },
  descendantStyles: BUMP_STYLES,
  renderer: OrderBumpRenderer,
}
