import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"
import { ICONS, ICON_NAMES } from "./set"

/**
 * docs/component-library.md § Icon: Size, Stroke, Colour, Rotation.
 *
 * All four, plus which icon and what it is called. Size is `width` and
 * `height` together through one control, because an icon that is wider than it
 * is tall is a mistake rather than a design.
 */
export const iconProperties = defineProperties([
  {
    key: "name",
    target: "prop",
    label: "Icon",
    group: "General",
    control: "select",
    options: ICON_NAMES.map((name) => ({ value: name, label: ICONS[name].label })),
  },
  {
    key: "label",
    target: "prop",
    label: "Label",
    group: "Accessibility",
    control: "text",
    help: "What it means, for somebody who cannot see it. Leave empty for an icon beside text that already says it.",
  },
  {
    key: "width",
    target: "style",
    label: "Size",
    group: "Layout",
    control: "dimension",
    units: ["em", "px", "rem"],
    help: "In em it follows the text beside it.",
    responsive: true,
  },
  {
    key: "strokeWidth",
    target: "prop",
    label: "Stroke",
    group: "Typography",
    control: "number",
    min: 1,
    max: 3,
  },
  common.color,
  {
    key: "rotate",
    target: "style",
    label: "Rotation",
    group: "Effects",
    control: "select",
    options: [
      { value: "0deg", label: "None" },
      { value: "90deg", label: "Quarter turn" },
      { value: "180deg", label: "Half turn" },
      { value: "270deg", label: "Three quarters" },
    ],
    responsive: true,
  },
])
