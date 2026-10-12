import type { StyleProperties } from "@checkout-studio/schema"

/**
 * What the elements inside a block look like.
 *
 * Both components that render the tree use these — it belongs to the markup
 * rather than to either one. A Code Block layers the merchant's own rules on
 * top; see `blockStyles`.
 *
 * ## Why a component has to say this at all
 *
 * The cascade styles nodes, and the elements a block draws are not nodes. The
 * first screenshot of HTML Block is what showed it: a merchant's `<h2>` at body
 * size, a list with no bullets, a link reading as text. Nothing was broken —
 * nothing had been asked to style them.
 *
 * ## Every value comes from the theme
 *
 * The heading steps are the theme's own type scale, so a block's heading and a
 * Heading node beside it are the same size, and rebranding moves both. Nothing
 * here is a literal, for the reason nothing anywhere is: a value the theme
 * cannot reach is a value the merchant cannot change.
 *
 * ## What is deliberately absent
 *
 * No colour on the text. It inherits, which means a block inside a section with
 * a dark background is readable without the block knowing anything about where
 * it was dropped.
 *
 * No margins on the last element and no top margin on the first, because a
 * block's own spacing is the node's and these would add to it — the usual way
 * pasted content ends up with a gap nobody can find the source of.
 */

/**
 * The theme's typography, with a block's own rules layered over it.
 *
 * Per selector rather than per map: a merchant writing `h2 { text-transform:
 * uppercase }` means "and uppercase", not "and nothing else". Replacing the
 * map wholesale is what the first version did, and it left a Code Block's
 * heading at body size while the rule the author wrote worked perfectly —
 * which looks like the theme being broken rather than like a merge.
 */
export function blockStyles(
  own: Readonly<Record<string, StyleProperties>>,
): Record<string, StyleProperties> {
  const merged: Record<string, StyleProperties> = { ...BLOCK_TYPOGRAPHY }

  for (const [selector, declarations] of Object.entries(own)) {
    merged[selector] = { ...merged[selector], ...declarations }
  }

  return merged
}

const heading = (step: "h1" | "h2" | "h3" | "h4"): StyleProperties => ({
  fontFamily: "{typography.fontFamily.heading}",
  fontSize: `{typography.scale.${step}.fontSize}`,
  lineHeight: `{typography.scale.${step}.lineHeight}`,
  letterSpacing: `{typography.scale.${step}.letterSpacing}`,
  fontWeight: `{typography.scale.${step}.fontWeight}`,
  marginBottom: "{spacing.3}",
})

export const BLOCK_TYPOGRAPHY: Readonly<Record<string, StyleProperties>> = {
  h1: heading("h1"),
  h2: heading("h2"),
  h3: heading("h3"),
  // The theme's scale stops at h4, and so does the distinction. An h5 and an h6
  // deeper than that in a merchant's block are structure rather than a size
  // somebody chose.
  "h4, h5, h6": heading("h4"),

  p: {
    fontSize: "{typography.scale.body.fontSize}",
    lineHeight: "{typography.scale.body.lineHeight}",
    marginBottom: "{spacing.4}",
  },

  /*
   * Lists get their markers back.
   *
   * Tailwind's preflight removes them, which is right for an interface built
   * from components and wrong for prose somebody wrote in HTML: a list without
   * markers reads as consecutive paragraphs.
   */
  ul: { listStyleType: "disc", paddingLeft: "{spacing.6}", marginBottom: "{spacing.4}" },
  ol: { listStyleType: "decimal", paddingLeft: "{spacing.6}", marginBottom: "{spacing.4}" },
  li: { marginBottom: "{spacing.1}" },

  a: { color: "{colors.primary}", textDecorationLine: "underline" },

  strong: { fontWeight: "{typography.scale.h4.fontWeight}" },

  blockquote: {
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: "{colors.border}",
    paddingLeft: "{spacing.4}",
    marginBottom: "{spacing.4}",
  },

  pre: {
    fontFamily: "{typography.fontFamily.mono}",
    fontSize: "{typography.scale.small.fontSize}",
    backgroundColor: "{colors.surfaceRaised}",
    padding: "{spacing.4}",
    // Code does not wrap, and a block that overflows its section pushes the
    // page sideways on a phone.
    overflowX: "auto",
    marginBottom: "{spacing.4}",
  },

  code: {
    fontFamily: "{typography.fontFamily.mono}",
    fontSize: "{typography.scale.small.fontSize}",
  },

  table: { width: "100%", borderCollapse: "collapse", marginBottom: "{spacing.4}" },

  "th, td": {
    textAlign: "left",
    padding: "{spacing.2}",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "{colors.border}",
  },

  th: { fontWeight: "{typography.scale.h4.fontWeight}" },

  caption: {
    fontSize: "{typography.scale.caption.fontSize}",
    textAlign: "left",
    marginBottom: "{spacing.2}",
  },

  hr: {
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "{colors.border}",
    marginBottom: "{spacing.4}",
  },

  small: { fontSize: "{typography.scale.small.fontSize}" },

  figure: { marginBottom: "{spacing.4}" },

  figcaption: { fontSize: "{typography.scale.caption.fontSize}", marginTop: "{spacing.2}" },
}
