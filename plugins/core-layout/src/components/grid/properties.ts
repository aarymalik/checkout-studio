import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Grid: Columns, Gap, Alignment, Auto Flow.
 *
 * Columns is a style, not a prop, and that is what delivers "Supports: Desktop
 * Tablet Mobile". A prop could hold the number but the document stores
 * per-breakpoint overrides for styles only, so a grid that was three across on
 * a desktop could never be one on a phone. The `columns` control presents a
 * count and stores the track list it means.
 */
export const gridProperties = defineProperties([
  {
    key: "gridTemplateColumns",
    target: "style",
    label: "Columns",
    group: "Layout",
    control: "columns",
    min: 1,
    max: 12,
    responsive: true,
  },
  common.gap,
  common.alignItems,
  {
    key: "gridAutoFlow",
    target: "style",
    label: "Auto flow",
    group: "Advanced",
    control: "select",
    options: [
      { value: "row", label: "Fill rows" },
      { value: "column", label: "Fill columns" },
      { value: "row dense", label: "Fill rows, closing gaps" },
    ],
    help: "Where a child goes when it was not given a position.",
    advanced: true,
    responsive: true,
  },
])
