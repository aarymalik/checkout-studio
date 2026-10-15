import type { StyleProperties } from "@checkout-studio/schema"

/**
 * What a set of delivery options looks like.
 *
 * One row per method, each a bordered box so the hit area is visible rather
 * than implied — somebody choosing between two prices should be able to see
 * what they are aiming at.
 */
export const SHIPPING_STYLES: Readonly<Record<string, StyleProperties>> = {
  ".ck-shipping-legend": {
    padding: "0",
    marginBottom: "{spacing.2}",
    fontSize: "{typography.scale.small.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },

  ".ck-shipping-method": {
    display: "flex",
    alignItems: "center",
    gap: "{spacing.3}",
    padding: "{spacing.3}",
    marginBottom: "{spacing.2}",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "{colors.border}",
    borderRadius: "{radius.sm}",
    backgroundColor: "{colors.surface}",
    cursor: "pointer",
    transitionProperty: "border-color",
    transitionDuration: "{motion.durationFast}",
    transitionTimingFunction: "{motion.easing}",
  },

  input: { accentColor: "{colors.primary}", cursor: "pointer", flexShrink: "0" },

  ".ck-shipping-body": { display: "flex", flexDirection: "column", flexGrow: "1", minWidth: "0" },

  ".ck-shipping-label": {
    fontSize: "{typography.scale.body.fontSize}",
    color: "{colors.foreground}",
  },

  ".ck-shipping-note": {
    fontSize: "{typography.scale.caption.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  ".ck-shipping-amount": {
    flexShrink: "0",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },

  ".ck-shipping-empty": {
    margin: "0",
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },
}
