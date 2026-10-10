import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"
import { ICONS, ICON_NAMES } from "../icon/set"

/**
 * docs/component-library.md § Button: Text, Icon, Width, Height, Padding,
 * Radius, Shadow, Gradient, Border, Hover, Pressed, Disabled, Loading, Target,
 * Link, Analytics Event.
 *
 * Fourteen of the sixteen are here. Hover and Pressed are the other two, and
 * they are not controls: the document stores a state layer per style, so every
 * style below marked `states: true` already has them. Four more controls would
 * be a second way to write the same thing.
 */
export const buttonProperties = defineProperties([
  common.text,
  {
    key: "icon",
    target: "prop",
    label: "Icon",
    group: "General",
    control: "select",
    options: [
      { value: "", label: "None" },
      ...ICON_NAMES.map((name) => ({ value: name, label: ICONS[name].label })),
    ],
  },
  {
    key: "href",
    target: "prop",
    label: "Link",
    group: "General",
    control: "url",
    help: "A page, or an address. A button without one does nothing until Phase 10 gives it an action.",
  },
  {
    key: "target",
    target: "prop",
    label: "Opens in",
    group: "General",
    control: "select",
    options: [
      { value: "_self", label: "This tab" },
      { value: "_blank", label: "A new tab" },
    ],
    showWhen: { key: "href", equals: "" },
  },
  { key: "disabled", target: "prop", label: "Disabled", group: "General", control: "toggle" },
  {
    key: "loading",
    target: "prop",
    label: "Loading",
    group: "General",
    control: "toggle",
    help: "Shows a spinner and refuses presses. Bound by the checkout while a payment is in flight.",
  },
  common.width,
  {
    key: "height",
    target: "style",
    label: "Height",
    group: "Layout",
    control: "dimension",
    units: ["px", "rem", "auto"],
    responsive: true,
  },
  common.padding,
  common.backgroundColor,
  {
    key: "gradient",
    target: "prop",
    label: "Gradient",
    group: "Background",
    control: "gradient",
    help: "Paints the button instead of a flat colour.",
  },
  common.color,
  common.borderRadius,
  {
    key: "border",
    target: "style",
    label: "Border",
    group: "Border",
    control: "border",
    responsive: true,
    states: true,
  },
  {
    key: "boxShadow",
    target: "style",
    label: "Shadow",
    group: "Effects",
    control: "shadow",
    responsive: true,
    states: true,
  },
  {
    key: "event",
    target: "prop",
    label: "Analytics event",
    group: "Advanced",
    control: "text",
    help: "Reported when somebody presses it, once analytics arrives in Phase 18.",
    advanced: true,
  },
])
