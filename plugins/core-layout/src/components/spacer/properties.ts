import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Spacer: Height, responsive.
 *
 * One property, and the responsiveness is the point of it: 64px of air between
 * two sections on a desktop is a third of a phone screen.
 */
export const spacerProperties = defineProperties([
  {
    key: "height",
    target: "style",
    label: "Height",
    group: "Layout",
    control: "dimension",
    units: ["px", "rem", "vh", "%"],
    responsive: true,
  },
])
