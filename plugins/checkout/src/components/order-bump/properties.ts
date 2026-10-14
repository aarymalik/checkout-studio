import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Order Bump: Title, Description, Price, Image,
 * Badge, Animation.
 *
 * Animation is absent. What the catalog means by it is the flashing border
 * these offers usually have, and that is decoration — the one thing CLAUDE.md's
 * motion rules forbid outright. The change of state when somebody accepts the
 * offer is animated, because that is animation communicating something, and it
 * takes no time at all for a reader who has asked for less motion.
 */
export const orderBumpProperties = defineProperties([
  { key: "title", target: "prop", label: "Title", group: "General", control: "text" },
  {
    key: "description",
    target: "prop",
    label: "Description",
    group: "General",
    control: "text",
  },
  {
    key: "price",
    target: "prop",
    label: "Price",
    group: "General",
    control: "number",
    min: 0,
    help: "In the currency's smallest unit. 499 is £4.99. The server's price wins once it answers.",
  },
  { key: "badge", target: "prop", label: "Badge", group: "General", control: "text" },
  { key: "image", target: "prop", label: "Image", group: "General", control: "asset" },
  {
    key: "imageAlt",
    target: "prop",
    label: "Image description",
    group: "Accessibility",
    control: "text",
    help: "Leave empty when the picture only shows what the title already says.",
  },
  {
    key: "currency",
    target: "prop",
    label: "Currency",
    group: "Advanced",
    control: "text",
    help: "Only used before a quote arrives. The quote's own currency wins.",
  },
])
