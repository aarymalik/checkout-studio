import type { StyleProperties } from "@checkout-studio/schema"

/**
 * A stack of disclosures.
 *
 * The browser's own marker is removed: it is a different shape on every
 * platform, which would make a baseline taken on one of them worthless on the
 * next. The chevron beside it is ours and is the same everywhere.
 */
export const FAQ_STYLES: Readonly<Record<string, StyleProperties>> = {
  details: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "{colors.border}",
  },

  summary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "{spacing.3}",
    paddingTop: "{spacing.3}",
    paddingBottom: "{spacing.3}",
    cursor: "pointer",
    listStyle: "none",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },

  // Safari draws its own triangle through this and ignores `list-style`.
  "summary::-webkit-details-marker": { display: "none" },

  svg: {
    width: "{spacing.4}",
    height: "{spacing.4}",
    flexShrink: "0",
    color: "{colors.foregroundMuted}",
    transitionProperty: "transform",
    transitionDuration: "{motion.durationFast}",
    transitionTimingFunction: "{motion.easing}",
  },

  /*
   * `details:open` rather than `details[open]`: a pseudo-class survives the
   * renderer's selector grammar and an attribute selector is dropped. On a
   * browser too old for it the chevron sits still and the disclosure works,
   * which is the right way round.
   */
  "details:open svg": { transform: "rotate(180deg)" },

  ".ck-faq-answer": {
    margin: "0 0 {spacing.3}",
    fontSize: "{typography.scale.small.fontSize}",
    lineHeight: "{typography.scale.body.lineHeight}",
    color: "{colors.foregroundMuted}",
  },
}
