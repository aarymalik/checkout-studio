import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Coupon: Placeholder, Button Text, Validation
 * Message, Success Message.
 *
 * The validation message is a fallback, not an override. The server says why a
 * code was refused — expired, spent, below the minimum — and that sentence is
 * more use to a customer than anything written here in advance. This is what
 * is shown when it says nothing.
 *
 * There is no property for what a code is worth, or which codes exist. Both
 * are the server's, and a control for either would be a discount the browser
 * could award itself.
 */
export const couponProperties = defineProperties([
  { key: "label", target: "prop", label: "Label", group: "General", control: "text" },
  {
    key: "placeholder",
    target: "prop",
    label: "Placeholder",
    group: "General",
    control: "text",
  },
  { key: "buttonLabel", target: "prop", label: "Button text", group: "General", control: "text" },
  {
    key: "successMessage",
    target: "prop",
    label: "Success message",
    group: "General",
    control: "text",
    help: "Shown once a code has been accepted.",
  },
  {
    key: "validationMessage",
    target: "prop",
    label: "Validation message",
    group: "General",
    control: "text",
    help: "Only used when the server refuses a code without saying why.",
  },
  {
    key: "removeLabel",
    target: "prop",
    label: "Remove text",
    group: "Advanced",
    control: "text",
  },
])
