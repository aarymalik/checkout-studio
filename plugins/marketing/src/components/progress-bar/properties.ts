import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Progress Bar: Value, Maximum, Label, Animation.
 *
 * Animation is absent, for the reason it is absent from Order Bump: a bar that
 * animates on its own is decoration, and the motion rules forbid it. The width
 * moves when the value changes, which is animation saying something happened.
 */
export const progressBarProperties = defineProperties([
  {
    key: "value",
    target: "prop",
    label: "Value",
    group: "General",
    control: "number",
    min: 0,
    help: "Clamped to the maximum. A bar cannot be more than full.",
  },
  { key: "max", target: "prop", label: "Maximum", group: "General", control: "number", min: 1 },
  {
    key: "label",
    target: "prop",
    label: "Label",
    group: "General",
    control: "text",
    help: "Read aloud with the bar, whether or not it is shown beneath it.",
  },
  {
    key: "showLabel",
    target: "prop",
    label: "Show the label",
    group: "General",
    control: "toggle",
  },
])
