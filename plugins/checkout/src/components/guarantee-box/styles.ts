import type { StyleProperties } from "@checkout-studio/schema"

/**
 * A promise, set apart from the order without shouting.
 *
 * The background and border the catalog lists as editable are the component's
 * own styles, so a merchant changes them through the cascade like any other
 * node and gets the responsive and state variants for free.
 */
export const GUARANTEE_STYLES: Readonly<Record<string, StyleProperties>> = {
  ".ck-guarantee-icon": {
    width: "{spacing.5}",
    height: "{spacing.5}",
    flexShrink: "0",
    color: "{colors.success}",
  },

  ".ck-guarantee-body": { display: "flex", flexDirection: "column", gap: "{spacing.1}" },

  ".ck-guarantee-title": {
    margin: "0",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },

  ".ck-guarantee-text": {
    margin: "0",
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },
}
