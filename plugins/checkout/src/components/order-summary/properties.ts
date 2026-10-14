import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Order Summary.
 *
 * Labels and which lines to show. There is no property for what any line
 * *contains*, because the contents are the server's — a control that let a
 * merchant set a total would be a control that lets them disagree with the
 * charge.
 */
export const orderSummaryProperties = defineProperties([
  {
    key: "hideZeroLines",
    target: "prop",
    label: "Hide empty lines",
    group: "General",
    control: "toggle",
    help: "A discount of nothing is noise. The total is always shown.",
  },
  {
    key: "labelsubtotal",
    target: "prop",
    label: "Subtotal label",
    group: "Advanced",
    control: "text",
  },
  {
    key: "labeldiscount",
    target: "prop",
    label: "Discount label",
    group: "Advanced",
    control: "text",
  },
  {
    key: "labelshipping",
    target: "prop",
    label: "Shipping label",
    group: "Advanced",
    control: "text",
  },
  { key: "labeltax", target: "prop", label: "Tax label", group: "Advanced", control: "text" },
  { key: "labeltotal", target: "prop", label: "Total label", group: "Advanced", control: "text" },
])
