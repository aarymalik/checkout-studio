import type { StyleProperties } from "@checkout-studio/schema"

/**
 * What an offer looks like before and after somebody takes it.
 *
 * A dashed border, because the thing is an aside rather than part of the order
 * — and a solid, tinted one once it has been accepted, because by then it is.
 * That change is the only animation here: it says something happened, which is
 * the whole of what the motion rules allow.
 */
export const BUMP_STYLES: Readonly<Record<string, StyleProperties>> = {
  ".ck-bump-label": {
    display: "flex",
    alignItems: "flex-start",
    gap: "{spacing.3}",
    padding: "{spacing.4}",
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: "{colors.borderStrong}",
    borderRadius: "{radius.md}",
    backgroundColor: "{colors.surface}",
    cursor: "pointer",
    transitionProperty: "border-color, background-color",
    transitionDuration: "{motion.durationFast}",
    transitionTimingFunction: "{motion.easing}",
  },

  ".ck-bump-on": {
    borderStyle: "solid",
    borderColor: "{colors.primary}",
    backgroundColor: "{colors.surfaceRaised}",
  },

  // Big enough to hit, and lined up with the first line of the title rather
  // than floating in the middle of a paragraph.
  input: {
    width: "{spacing.4}",
    height: "{spacing.4}",
    marginTop: "{spacing.1}",
    flexShrink: "0",
    accentColor: "{colors.primary}",
    cursor: "pointer",
  },

  img: {
    width: "{spacing.9}",
    height: "{spacing.9}",
    objectFit: "cover",
    borderRadius: "{radius.sm}",
    flexShrink: "0",
  },

  ".ck-bump-body": { display: "flex", flexDirection: "column", gap: "{spacing.1}", flexGrow: "1" },

  ".ck-bump-badge": {
    alignSelf: "flex-start",
    paddingTop: "{spacing.1}",
    paddingBottom: "{spacing.1}",
    paddingLeft: "{spacing.2}",
    paddingRight: "{spacing.2}",
    borderRadius: "{radius.full}",
    backgroundColor: "{colors.primary}",
    color: "{colors.primaryForeground}",
    fontSize: "{typography.scale.caption.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },

  ".ck-bump-title": {
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },

  ".ck-bump-description": {
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  ".ck-bump-price": {
    marginLeft: "auto",
    flexShrink: "0",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },
}
