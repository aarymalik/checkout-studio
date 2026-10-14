import type { StyleProperties } from "@checkout-studio/schema"

/**
 * What a summary's rows look like.
 *
 * A definition list is a stack of terms and descriptions by default, which
 * reads as two lines per row rather than as a receipt. These put each pair on
 * one line with the amount at the end, which is how a receipt is read.
 *
 * Every value is the theme's, so a summary agrees with the page it is on.
 */
export const SUMMARY_STYLES: Readonly<Record<string, StyleProperties>> = {
  div: {
    display: "flex",
    justifyContent: "space-between",
    gap: "{spacing.4}",
    paddingTop: "{spacing.2}",
    paddingBottom: "{spacing.2}",
    fontSize: "{typography.scale.body.fontSize}",
  },

  dt: { color: "{colors.foregroundMuted}" },

  dd: { margin: "0", color: "{colors.foreground}" },

  /*
   * The total reads as the total: heavier, and separated from the lines that
   * led to it. The last row is the total, because `rows.ts` fixes the order.
   */
  "div:last-child": {
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "{colors.border}",
    marginTop: "{spacing.2}",
    paddingTop: "{spacing.3}",
    fontSize: "{typography.scale.bodyLarge.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
  },

  "div:last-child dt": { color: "{colors.foreground}" },

  p: { color: "{colors.foregroundMuted}", fontSize: "{typography.scale.body.fontSize}" },
}
