import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { ProductListRenderer } from "./Renderer"
import { LIST_STYLES } from "./styles"

/**
 * Product List's registration.
 *
 * ## Why it is not Grid
 *
 * It holds products and nothing else, and that restriction is the whole of
 * what it adds: a list that accepted a heading and a divider would be a Grid
 * with a different name in the panel. `allowedChildTypes` is what makes the
 * editor refuse the drop rather than this component having to cope with a
 * child it cannot describe.
 *
 * ## Sorting and filtering are not here
 *
 * docs/component-library.md lists them as editables. Both need a set of
 * products large enough to have an order and a subset — a catalog — and there
 * is none: a checkout page holds the products a merchant put on it, in the
 * order they put them. The server's product source arrives with the pricing
 * engine in Phase 13, and sorting a list of three hand-placed cards before
 * then would be a control that reorders what somebody has just arranged by
 * hand. Recorded in docs/phases.md rather than built against nothing.
 */
export const productList: ComponentDefinition = {
  type: "checkout.product-list",
  name: "Product List",
  category: "Checkout",
  interactive: false,
  container: true,
  allowedChildTypes: ["checkout.product-card"],
  defaultProps: {},
  defaultStyles: {
    display: "grid",
    // One across: an order is read down the page, and a second column of
    // products is a shop rather than a checkout.
    gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    gap: "{spacing.4}",
    width: "100%",
    // A list, so the browser's bullets and indent have to go.
    listStyle: "none",
    margin: "0",
    padding: "0",
  },
  descendantStyles: LIST_STYLES,
  renderer: ProductListRenderer,
}
