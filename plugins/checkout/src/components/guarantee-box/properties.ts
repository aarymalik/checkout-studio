import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Guarantee Box: Icon, Title, Description,
 * Background, Border.
 *
 * Background and Border are styles, which is what makes them themeable and
 * responsive like every other node's. Only the words and the glyph are props.
 */
export const guaranteeBoxProperties = defineProperties([
  {
    key: "icon",
    target: "prop",
    label: "Icon",
    group: "General",
    control: "select",
    options: [
      { value: "shield", label: "Shield" },
      { value: "lock", label: "Lock" },
      { value: "check", label: "Tick" },
      { value: "truck", label: "Delivery" },
      { value: "card", label: "Card" },
    ],
  },
  { key: "title", target: "prop", label: "Title", group: "General", control: "text" },
  {
    key: "description",
    target: "prop",
    label: "Description",
    group: "General",
    control: "text",
  },
  {
    key: "backgroundColor",
    target: "style",
    label: "Background",
    group: "Background",
    control: "color",
  },
  { key: "borderColor", target: "style", label: "Border", group: "Border", control: "color" },
])
