import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Logo Wall: Columns, Spacing, Grayscale, Hover
 * Effect.
 *
 * Columns and Spacing are styles, so four across on a desktop can be two on a
 * phone. Grayscale and the hover effect are styles for the same reason and one
 * more: they are what the thing looks like, and a merchant who wants the logos
 * at full strength changes a filter rather than finding a toggle.
 */
export const logoWallProperties = defineProperties([
  {
    key: "logos",
    target: "prop",
    label: "Logos",
    group: "General",
    control: "text",
    help: "A picture and the name of whoever it belongs to. One without a name is left out.",
  },
  {
    key: "gridTemplateColumns",
    target: "style",
    label: "Columns",
    group: "Layout",
    control: "columns",
    min: 1,
    max: 8,
    responsive: true,
  },
  {
    key: "gap",
    target: "style",
    label: "Spacing",
    group: "Spacing",
    control: "dimension",
    units: ["px", "rem", "%"],
    responsive: true,
  },
])
