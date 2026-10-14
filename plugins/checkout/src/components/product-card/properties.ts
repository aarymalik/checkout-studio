import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Product Card.
 *
 * The catalog's eight editables, plus three that make them usable: which
 * heading level the title takes, how few counts as nearly gone, and which
 * currency to draw an authored price in before a quote has said.
 */
export const productCardProperties = defineProperties([
  { key: "title", target: "prop", label: "Title", group: "General", control: "text" },
  {
    key: "description",
    target: "prop",
    label: "Description",
    group: "General",
    control: "text",
  },
  { key: "image", target: "prop", label: "Image", group: "General", control: "asset" },
  {
    key: "price",
    target: "prop",
    label: "Price",
    group: "General",
    control: "number",
    min: 0,
    help: "In the currency's smallest unit. 1999 is £19.99.",
  },
  {
    key: "salePrice",
    target: "prop",
    label: "Sale price",
    group: "General",
    control: "number",
    min: 0,
    help: "When set, the price above is shown struck through.",
  },
  {
    key: "quantity",
    target: "prop",
    label: "Quantity",
    group: "General",
    control: "number",
    min: 0,
    help: "How many of this go in the cart. Zero leaves it out.",
  },
  {
    key: "imageAlt",
    target: "prop",
    label: "Image description",
    group: "Accessibility",
    control: "text",
    help: "Leave empty when the picture only shows what the title already says.",
  },
  {
    key: "headingLevel",
    target: "prop",
    label: "Title level",
    group: "Accessibility",
    control: "select",
    options: [
      { value: "h2", label: "Heading 2" },
      { value: "h3", label: "Heading 3" },
      { value: "h4", label: "Heading 4" },
      { value: "h5", label: "Heading 5" },
      { value: "h6", label: "Heading 6" },
    ],
    help: "Match the section this card sits in, so the page outline reads in order.",
  },
  { key: "sku", target: "prop", label: "SKU", group: "Advanced", control: "text" },
  {
    key: "inventory",
    target: "prop",
    label: "Inventory",
    group: "Advanced",
    control: "number",
    min: 0,
    help: "Left empty, the card says nothing about stock.",
  },
  {
    key: "lowStockAt",
    target: "prop",
    label: "Low stock at",
    group: "Advanced",
    control: "number",
    min: 1,
    help: "At or below this, the card says how few are left.",
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
