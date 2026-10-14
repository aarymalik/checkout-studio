import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Product List: Columns, Sorting, Filtering,
 * Spacing.
 *
 * Columns and Spacing are here, as styles. A style rather than a prop is what
 * delivers the responsive half: the document stores per-breakpoint overrides
 * for styles only, so a list that is two across on a desktop can be one on a
 * phone — which is the only arrangement that works on a phone.
 *
 * Sorting and Filtering are absent, with the reason in the definition beside
 * this file: there is no catalog to sort or filter until Phase 13.
 */
export const productListProperties = defineProperties([
  {
    key: "gridTemplateColumns",
    target: "style",
    label: "Columns",
    group: "Layout",
    control: "columns",
    min: 1,
    max: 4,
    responsive: true,
  },
  {
    key: "gap",
    target: "style",
    label: "Spacing",
    group: "Spacing",
    control: "dimension",
    units: ["px", "rem", "%"],
    help: "Space between products, without adding space around them.",
    responsive: true,
  },
])
