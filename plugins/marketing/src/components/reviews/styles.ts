import type { StyleProperties } from "@checkout-studio/schema"

import { STAR_STYLES } from "../stars"

/** Stars, then the figures that say what they mean. */
export const REVIEWS_STYLES: Readonly<Record<string, StyleProperties>> = {
  ...STAR_STYLES,

  ".ck-reviews-line": {
    display: "flex",
    flexWrap: "wrap",
    gap: "{spacing.1}",
    margin: "{spacing.2} 0 0",
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  ".ck-reviews-rating": {
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },
}
