import type { StyleProperties } from "@checkout-studio/schema"

/**
 * A row of numbers with their units under them.
 *
 * The colours the catalog lists as editable are the component's own styles, so
 * a merchant changes them through the cascade like any other node and gets the
 * responsive and dark variants without a second control.
 */
export const COUNTDOWN_STYLES: Readonly<Record<string, StyleProperties>> = {
  ".ck-countdown-label": {
    margin: "0 0 {spacing.2}",
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  ".ck-countdown-parts": { display: "flex", gap: "{spacing.3}" },

  ".ck-countdown-part": {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "{spacing.9}",
    padding: "{spacing.2}",
    borderRadius: "{radius.md}",
    backgroundColor: "{colors.surfaceRaised}",
  },

  ".ck-countdown-value": {
    fontSize: "{typography.scale.h3.fontSize}",
    fontWeight: "{typography.scale.h3.fontWeight}",
    lineHeight: "1",
    color: "{colors.foreground}",
    // The digits change every second, and proportional figures make the row
    // jump about as a 1 replaces a 4.
    fontVariantNumeric: "tabular-nums",
  },

  ".ck-countdown-unit": {
    marginTop: "{spacing.1}",
    fontSize: "{typography.scale.caption.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  ".ck-countdown-expired": {
    margin: "0",
    fontSize: "{typography.scale.body.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  // Read and not seen: the deadline in words, for somebody the ticking digits
  // are hidden from.
  ".ck-countdown-said": {
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
