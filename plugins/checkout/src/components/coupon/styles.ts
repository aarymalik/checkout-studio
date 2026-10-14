import type { StyleProperties } from "@checkout-studio/schema"

/**
 * What a coupon field looks like.
 *
 * A field and a button on one line, because they are one action. Every value
 * is the theme's, so the control agrees with the form it sits beside rather
 * than with whatever this plugin happened to think a button looks like.
 */
export const COUPON_STYLES: Readonly<Record<string, StyleProperties>> = {
  label: {
    display: "block",
    marginBottom: "{spacing.2}",
    fontSize: "{typography.scale.small.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },

  ".ck-coupon-row": { display: "flex", gap: "{spacing.2}", alignItems: "stretch" },

  input: {
    flexGrow: "1",
    minWidth: "0",
    paddingTop: "{spacing.2}",
    paddingBottom: "{spacing.2}",
    paddingLeft: "{spacing.3}",
    paddingRight: "{spacing.3}",
    fontSize: "{typography.scale.body.fontSize}",
    color: "{colors.foreground}",
    backgroundColor: "{colors.surface}",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "{colors.border}",
    borderRadius: "{radius.sm}",
  },

  /*
   * Refused, said in more than colour. The border changes and so does the
   * message below it, because a customer who cannot tell the two borders apart
   * still has to know the code did not work.
   *
   * A class rather than `[aria-invalid="true"]`: the renderer's selector
   * grammar is a character allowlist with no brackets or quotes in it, so an
   * attribute selector is dropped rather than emitted — a rule that would have
   * styled nothing, silently.
   */
  ".ck-coupon-invalid": { borderColor: "{colors.danger}" },

  button: {
    paddingTop: "{spacing.2}",
    paddingBottom: "{spacing.2}",
    paddingLeft: "{spacing.4}",
    paddingRight: "{spacing.4}",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.primaryForeground}",
    backgroundColor: "{colors.primary}",
    borderWidth: "0",
    borderRadius: "{radius.sm}",
    cursor: "pointer",
  },

  // Pressable-looking but not pressable. The focus stays where it was.
  ".ck-coupon-waiting": { opacity: "0.6", cursor: "progress" },

  ".ck-coupon-applied": {
    display: "flex",
    alignItems: "center",
    gap: "{spacing.3}",
    margin: "0",
    fontSize: "{typography.scale.body.fontSize}",
    color: "{colors.foreground}",
  },

  ".ck-coupon-code": {
    fontWeight: "{typography.scale.h4.fontWeight}",
    // A code is a string to be copied exactly, so it is set in the face that
    // tells an l from a 1.
    fontFamily: "{typography.fontFamily.mono}",
  },

  ".ck-coupon-amount": { color: "{colors.success}" },

  ".ck-coupon-remove": {
    marginLeft: "auto",
    padding: "0",
    color: "{colors.foregroundMuted}",
    backgroundColor: "transparent",
    fontSize: "{typography.scale.small.fontSize}",
    fontWeight: "{typography.scale.body.fontWeight}",
    textDecoration: "underline",
    cursor: "pointer",
  },

  ".ck-coupon-message": {
    margin: "{spacing.2} 0 0",
    fontSize: "{typography.scale.caption.fontSize}",
    color: "{colors.foregroundMuted}",
    // Empty most of the time, and it should not push the page about when it
    // stops being empty.
    minHeight: "{typography.scale.caption.fontSize}",
  },
}
