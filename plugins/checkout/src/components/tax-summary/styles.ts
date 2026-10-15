import type { StyleProperties } from "@checkout-studio/schema"

/**
 * The same shape as an order summary's rows, because it is the same kind of
 * thing: a term and an amount, one per line, read as a pair.
 */
export const TAX_STYLES: Readonly<Record<string, StyleProperties>> = {
  dl: { margin: "0" },

  "dl div": {
    display: "flex",
    justifyContent: "space-between",
    gap: "{spacing.4}",
    paddingTop: "{spacing.1}",
    paddingBottom: "{spacing.1}",
    fontSize: "{typography.scale.small.fontSize}",
  },

  dt: { color: "{colors.foregroundMuted}" },

  dd: { margin: "0", color: "{colors.foreground}" },

  ".ck-tax-note": {
    margin: "{spacing.2} 0 0",
    fontSize: "{typography.scale.caption.fontSize}",
    color: "{colors.foregroundMuted}",
  },
}
