import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { DividerRenderer } from "./Renderer"

/**
 * Divider's registration.
 *
 * ## Why every border edge is named
 *
 * An `<hr>` arrives with a browser style of its own — a 2px inset border on all
 * four sides, and a `1em` block margin. So the defaults here are not decoration
 * but a reset: without `borderStyle: none` first, the user's Thickness setting
 * lands on top of the browser's groove and the line is 3px of two colours.
 *
 * Only the top edge draws. Thickness and Colour in the catalog mean one line,
 * and a Divider that drew four would be a box.
 *
 * `1px` is a literal and stays one. A hairline is not a spacing step, and the
 * theme's thinnest token is 4.
 */
export const divider: ComponentDefinition = {
  type: "core.divider",
  name: "Divider",
  category: "Layout",
  interactive: false,
  container: false,
  defaultProps: {},
  defaultStyles: {
    borderStyle: "none",
    borderTopStyle: "solid",
    borderTopWidth: "1px",
    borderTopColor: "{colors.border}",
    width: "100%",
    marginTop: "{spacing.5}",
    marginBottom: "{spacing.5}",
    marginLeft: "0",
    marginRight: "0",
    flexShrink: 0,
  },
  renderer: DividerRenderer,
}
