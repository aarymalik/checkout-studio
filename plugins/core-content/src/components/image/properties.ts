import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Image: Source, Alt Text, Width, Height, Aspect
 * Ratio, Radius, Object Fit, Lazy Load.
 *
 * All eight, plus the decorative switch that makes an empty description a
 * statement rather than an omission.
 */
export const imageProperties = defineProperties([
  { key: "src", target: "prop", label: "Source", group: "General", control: "asset" },
  {
    key: "alt",
    target: "prop",
    label: "Description",
    group: "Accessibility",
    control: "text",
    help: "What somebody hears instead of seeing it.",
    showWhen: { key: "decorative", equals: false },
  },
  {
    key: "decorative",
    target: "prop",
    label: "Decorative",
    group: "Accessibility",
    control: "toggle",
    help: "Hides it from screen readers. For an image the text beside it already describes.",
  },
  common.width,
  {
    key: "height",
    target: "style",
    label: "Height",
    group: "Layout",
    control: "dimension",
    units: ["px", "rem", "%", "auto"],
    responsive: true,
  },
  {
    key: "aspectRatio",
    target: "style",
    label: "Aspect ratio",
    group: "Layout",
    control: "text",
    help: "Such as 16 / 9. Holds the space before the image arrives.",
    responsive: true,
  },
  common.borderRadius,
  {
    key: "objectFit",
    target: "style",
    label: "Fit",
    group: "Layout",
    control: "select",
    options: [
      { value: "cover", label: "Fill the box, cropping" },
      { value: "contain", label: "Fit inside, letterboxed" },
      { value: "fill", label: "Stretch to the box" },
      { value: "none", label: "Original size" },
      { value: "scale-down", label: "Smaller of none and contain" },
    ],
    responsive: true,
  },
  {
    key: "eager",
    target: "prop",
    label: "Load immediately",
    group: "Advanced",
    control: "toggle",
    help: "On for an image above the fold. Off everywhere else, so a visitor does not pay for what they never scroll to.",
    advanced: true,
  },
])
