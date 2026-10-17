import type { StyleProperties } from "@checkout-studio/schema"

import { STAR_STYLES } from "../stars"

/** A quotation, its stars above it and its author below. */
export const TESTIMONIAL_STYLES: Readonly<Record<string, StyleProperties>> = {
  ...STAR_STYLES,

  ".ck-testimonial-rating": { margin: "0 0 {spacing.3}", lineHeight: "0" },

  blockquote: {
    margin: "0",
    fontSize: "{typography.scale.bodyLarge.fontSize}",
    lineHeight: "{typography.scale.bodyLarge.lineHeight}",
    color: "{colors.foreground}",
  },

  figcaption: {
    display: "flex",
    alignItems: "center",
    gap: "{spacing.3}",
    marginTop: "{spacing.4}",
  },

  img: {
    width: "{spacing.7}",
    height: "{spacing.7}",
    borderRadius: "{radius.full}",
    objectFit: "cover",
    flexShrink: "0",
  },

  ".ck-testimonial-who": { display: "flex", flexDirection: "column" },

  ".ck-testimonial-name": {
    fontSize: "{typography.scale.small.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },

  ".ck-testimonial-role": {
    fontSize: "{typography.scale.caption.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  ".ck-testimonial-said": {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: "0",
  },
}
