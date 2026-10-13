import type { StyleProperties } from "@checkout-studio/schema"

import { FIELD_ERROR_CLASS } from "./Field"

/**
 * What every field's parts look like.
 *
 * The cascade reaches nodes, and a field's label, control and messages are
 * not nodes — the first screenshot of the gallery case was three labels and no
 * boxes, because Tailwind's preflight strips an input of its border, padding
 * and background and nothing had been asked to put them back.
 *
 * Every value is the theme's. A merchant who changes their radius or their
 * border colour changes their fields, and a field sitting beside a Button
 * agrees with it about what a control looks like.
 *
 * The error's colour is on a class rather than on the `data-` attribute the
 * renderer also sets: the engine's selector grammar is element names, classes
 * and combinators, and an attribute selector is the one construct it refuses.
 */
export const FIELD_STYLES: Readonly<Record<string, StyleProperties>> = {
  label: {
    display: "block",
    fontSize: "{typography.scale.small.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
    marginBottom: "{spacing.1}",
  },

  "input, textarea, select": {
    display: "block",
    width: "100%",
    fontFamily: "{typography.fontFamily.body}",
    fontSize: "{typography.scale.body.fontSize}",
    color: "{colors.foreground}",
    backgroundColor: "{colors.surface}",
    paddingTop: "{spacing.2}",
    paddingBottom: "{spacing.2}",
    paddingLeft: "{spacing.3}",
    paddingRight: "{spacing.3}",
    borderWidth: "1px",
    borderStyle: "solid",
    /*
     * The strong border, not the decorative one. A field's edge is what tells
     * somebody where to type, so it is a boundary WCAG 1.4.11 governs rather
     * than a hairline between sections.
     */
    borderColor: "{colors.borderStrong}",
    borderRadius: "{radius.sm}",
  },

  p: {
    fontSize: "{typography.scale.caption.fontSize}",
    color: "{colors.foregroundMuted}",
    marginTop: "{spacing.1}",
  },

  // An error is not a quieter note than the help text. It is the thing the
  // person has to act on, and it is the only red on the field.
  [`p.${FIELD_ERROR_CLASS}`]: { color: "{colors.danger}" },

  /*
   * A radio group's label is a legend, and a legend is not a label — it has
   * its own box, its own default margins, and a browser's own idea of where
   * it sits on the fieldset's border. Said flat, it reads as the label it is.
   */
  fieldset: { borderWidth: "0", padding: "0", margin: "0" },
  legend: {
    display: "block",
    padding: "0",
    fontSize: "{typography.scale.small.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
    marginBottom: "{spacing.1}",
  },

  // A tick and its words sit on one line, and the words are clickable.
  "label.ck-field-choice": {
    display: "flex",
    alignItems: "center",
    gap: "{spacing.2}",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.body.fontWeight}",
    marginBottom: "{spacing.1}",
  },

  "input.ck-field-tick": {
    width: "auto",
    marginTop: "0",
    accentColor: "{colors.primary}",
  },
}
