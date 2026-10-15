import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Tax Summary.
 *
 * There is no control for a rate. Where the rates come from is in
 * docs/stripe-integration.md § Tax, and a component that applied one would be
 * working out a figure that has to match what is remitted.
 */
export const taxSummaryProperties = defineProperties([
  { key: "label", target: "prop", label: "Label", group: "General", control: "text" },
  {
    key: "hideWhenZero",
    target: "prop",
    label: "Hide when there is no tax",
    group: "General",
    control: "toggle",
    help: "An order that attracts no tax says nothing rather than saying zero.",
  },
  {
    key: "note",
    target: "prop",
    label: "Note",
    group: "General",
    control: "text",
    help: "A sentence under the figures, such as where the rate comes from.",
  },
])
