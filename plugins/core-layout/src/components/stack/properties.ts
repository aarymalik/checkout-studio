import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Stack: Direction, Gap, Wrap, Alignment, Justify.
 *
 * All five are styles and all five are responsive, which is the whole of how a
 * row becomes a column on a phone: the user sets Direction at the mobile
 * breakpoint and the cascade does the rest. No component code is involved,
 * because a component never sees a resolved style — it is handed a class.
 */
export const stackProperties = defineProperties([
  {
    key: "flexDirection",
    target: "style",
    label: "Direction",
    group: "Layout",
    control: "select",
    options: [
      { value: "column", label: "Vertical" },
      { value: "row", label: "Horizontal" },
      { value: "column-reverse", label: "Vertical, reversed" },
      { value: "row-reverse", label: "Horizontal, reversed" },
    ],
    responsive: true,
  },
  common.gap,
  {
    key: "flexWrap",
    target: "style",
    label: "Wrap",
    group: "Layout",
    control: "select",
    options: [
      { value: "nowrap", label: "Never" },
      { value: "wrap", label: "When needed" },
      { value: "wrap-reverse", label: "When needed, reversed" },
    ],
    help: "Lets children fall onto a second line instead of shrinking.",
    responsive: true,
  },
  common.alignItems,
  common.justifyContent,
])
