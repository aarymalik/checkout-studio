import type { StyleProperties } from "@checkout-studio/schema"

/**
 * A row of reassurances.
 *
 * Direction and gap are the component's defaults rather than props, which is
 * what the catalog's "Layout" and "Spacing" become here: a style can be
 * overridden per breakpoint, so three badges across on a desktop stack on a
 * phone without a second control that has to agree with the first.
 */
export const TRUST_STYLES: Readonly<Record<string, StyleProperties>> = {
  li: {
    display: "flex",
    alignItems: "center",
    gap: "{spacing.2}",
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  svg: {
    width: "{spacing.4}",
    height: "{spacing.4}",
    flexShrink: "0",
    // Inherits the muted colour of the line it sits on, so a badge is one
    // thing rather than a grey sentence beside a coloured mark.
    color: "{colors.foregroundMuted}",
  },
}
