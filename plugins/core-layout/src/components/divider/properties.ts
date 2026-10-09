import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Divider: Thickness, Colour, Width, Style, Margin.
 *
 * Every one of them is the top edge, because a divider is one line. The keys
 * say `borderTop*` and the labels do not — somebody drawing a line between two
 * sections is not thinking about which edge of a box it is.
 */
export const dividerProperties = defineProperties([
  {
    key: "borderTopWidth",
    target: "style",
    label: "Thickness",
    group: "Border",
    control: "dimension",
    units: ["px", "rem"],
    responsive: true,
  },
  {
    key: "borderTopColor",
    target: "style",
    label: "Colour",
    group: "Border",
    control: "color",
    responsive: true,
  },
  common.width,
  {
    key: "borderTopStyle",
    target: "style",
    label: "Style",
    group: "Border",
    control: "select",
    options: [
      { value: "solid", label: "Solid" },
      { value: "dashed", label: "Dashed" },
      { value: "dotted", label: "Dotted" },
      { value: "double", label: "Double" },
    ],
    responsive: true,
  },
  common.margin,
])
