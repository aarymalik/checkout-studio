import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { IconRenderer } from "./Renderer"

/**
 * Icon's registration.
 *
 * Sized in `em` rather than in pixels, so an icon beside a line of text is the
 * size of that text and stays so when somebody changes it. A 24px icon next to
 * a 14px caption is a decision nobody made twice.
 *
 * Rotation is a style, so it can differ per breakpoint — an arrow that points
 * right beside a row and down above a stacked one is the same icon turned.
 */
export const icon: ComponentDefinition = {
  type: "core.icon",
  name: "Icon",
  category: "Media",
  interactive: false,
  container: false,
  defaultProps: { name: "check", label: "", strokeWidth: 2 },
  defaultStyles: {
    display: "inline-block",
    width: "1.25em",
    height: "1.25em",
    color: "{colors.foreground}",
    // Lines up with the text it sits beside rather than on the baseline, where
    // a square glyph hangs low.
    verticalAlign: "-0.2em",
  },
  renderer: IconRenderer,
}
