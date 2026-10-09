import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { BadgeRenderer } from "./Renderer"

/**
 * Badge's registration.
 *
 * `inline-flex` rather than `inline-block`, so the text centres vertically
 * inside the padding without a line-height that has to be kept in step with
 * the font size.
 *
 * Its colours are the theme's primary pair, which is the one combination a
 * theme guarantees is readable: `primaryForeground` exists precisely to be
 * legible on `primary`. A badge that picked `foreground` on `primary` would be
 * dark grey on indigo, and the contrast would depend on the brand.
 */
export const badge: ComponentDefinition = {
  type: "core.badge",
  name: "Badge",
  category: "Typography",
  interactive: false,
  container: false,
  defaultProps: { text: "New" },
  defaultStyles: {
    display: "inline-flex",
    alignItems: "center",
    // Enough not to look cramped; not enough to read as a button.
    paddingTop: "{spacing.1}",
    paddingBottom: "{spacing.1}",
    paddingLeft: "{spacing.2}",
    paddingRight: "{spacing.2}",
    backgroundColor: "{colors.primary}",
    color: "{colors.primaryForeground}",
    borderRadius: "{radius.full}",
    fontFamily: "{typography.fontFamily.body}",
    fontSize: "{typography.scale.caption.fontSize}",
    fontWeight: 500,
    lineHeight: "{typography.scale.caption.lineHeight}",
    // A badge sits beside things, so it must not stretch to fill a flex parent.
    alignSelf: "flex-start",
  },
  renderer: BadgeRenderer,
}
