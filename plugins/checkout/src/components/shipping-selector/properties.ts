import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Shipping Selector.
 *
 * Words only. What a merchant can change is what the group is called, what a
 * method costing nothing is called, and what is said when there is nothing to
 * choose from. The methods, their prices and which ones apply are decided when
 * the cart is priced, and a control for any of them would be a price the
 * browser holds.
 */
export const shippingSelectorProperties = defineProperties([
  { key: "label", target: "prop", label: "Label", group: "General", control: "text" },
  {
    key: "freeLabel",
    target: "prop",
    label: "Free label",
    group: "General",
    control: "text",
    help: "Shown instead of an amount when a method costs nothing.",
  },
  {
    key: "emptyMessage",
    target: "prop",
    label: "Empty message",
    group: "General",
    control: "text",
    help: "Shown before the order has been priced, and when it has no delivery options.",
  },
])
