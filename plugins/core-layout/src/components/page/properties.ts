import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * What the inspector offers for the page itself.
 *
 * Short on purpose. A page is selected by clicking past everything on it, and
 * the things worth setting there are the ones that apply to the whole document:
 * what colour it is, what it is made of, and how wide its content runs.
 *
 * Not here: anything that belongs to the theme. A font scale or a brand colour
 * set on one page is a decision that silently fails to apply to the next one —
 * docs/theme-system.md puts those in the theme, where they reach every page at
 * once.
 */
export const pageProperties = defineProperties([
  {
    key: "backgroundColor",
    target: "style",
    label: "Background",
    group: "Background",
    control: "color",
    responsive: true,
  },
  {
    key: "backgroundImage",
    target: "prop",
    label: "Background image",
    group: "Background",
    control: "asset",
  },
  {
    key: "color",
    target: "style",
    label: "Text colour",
    group: "Typography",
    control: "color",
    help: "Inherited by everything that does not set its own.",
    responsive: true,
  },
  {
    key: "padding",
    target: "style",
    label: "Padding",
    group: "Spacing",
    control: "spacing",
    units: ["px", "rem"],
    responsive: true,
  },
])
