import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { ProductCardRenderer } from "./Renderer"
import { PRODUCT_STYLES } from "./styles"

/**
 * Product Card's registration.
 *
 * `interactive: true`, for two reasons rather than one: it reads a quote that
 * arrives after the page does, and it is what puts the product in the cart.
 * The second is the one that matters — a card rendered only on the server
 * would be a product nothing is being asked to price.
 *
 * ## Prices are stored in minor units
 *
 * `price: 1999` is £19.99. The server works in minor units, Stripe works in
 * minor units, and a card that stored 19.99 would be a card that has to
 * convert — which is the one piece of arithmetic that would put a different
 * number on the page from the one on the bill.
 *
 * What a merchant should *type* is a separate question, and Phase 12's
 * inspector is where it is answered: a currency control that shows £19.99 and
 * stores 1999. Recorded in docs/phases.md.
 */
export const productCard: ComponentDefinition = {
  type: "checkout.product-card",
  name: "Product Card",
  category: "Checkout",
  interactive: true,
  container: false,
  defaultProps: {
    title: "Product",
    description: "",
    image: "",
    imageAlt: "",
    sku: "",
    price: 1999,
    quantity: 1,
    currency: "GBP",
    headingLevel: "h3",
    lowStockAt: 5,
  },
  defaultStyles: {
    display: "flex",
    gap: "{spacing.4}",
    alignItems: "flex-start",
    width: "100%",
  },
  descendantStyles: PRODUCT_STYLES,
  renderer: ProductCardRenderer,
}
