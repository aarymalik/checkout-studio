import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { TaxSummaryRenderer } from "./Renderer"
import { TAX_STYLES } from "./styles"

/**
 * Tax Summary's registration.
 *
 * `interactive: true` for the same reason Order Summary is: the numbers arrive
 * after the page does and change when the cart does. Nothing here is clickable.
 */
export const taxSummary: ComponentDefinition = {
  type: "checkout.tax-summary",
  name: "Tax Summary",
  category: "Checkout",
  interactive: true,
  container: false,
  defaultProps: { label: "Tax", hideWhenZero: true },
  defaultStyles: { display: "block", width: "100%" },
  descendantStyles: TAX_STYLES,
  renderer: TaxSummaryRenderer,
}
