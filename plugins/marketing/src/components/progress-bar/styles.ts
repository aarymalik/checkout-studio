import type { StyleProperties } from "@checkout-studio/schema"

/** A track and the part of it that is filled. */
export const PROGRESS_STYLES: Readonly<Record<string, StyleProperties>> = {
  ".ck-progress-track": {
    width: "100%",
    height: "{spacing.2}",
    borderRadius: "{radius.full}",
    backgroundColor: "{colors.surfaceRaised}",
    overflow: "hidden",
  },

  ".ck-progress-fill": {
    height: "100%",
    borderRadius: "{radius.full}",
    backgroundColor: "{colors.primary}",
    // For when the value changes. Nothing animates on its own, and this is
    // nothing at all for a reader who has asked for less motion.
    transitionProperty: "width",
    transitionDuration: "{motion.durationNormal}",
    transitionTimingFunction: "{motion.easing}",
  },

  ".ck-progress-label": {
    margin: "{spacing.2} 0 0",
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },
}
