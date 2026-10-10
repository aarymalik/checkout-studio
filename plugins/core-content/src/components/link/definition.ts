import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { safeHref } from "../href"
import { hasNoText } from "../text"
import { LinkRenderer } from "./Renderer"

/**
 * Link's registration.
 *
 * Underlined by default, and it stays that way unless somebody decides
 * otherwise. Colour alone is not enough to tell a link from text — WCAG 1.4.1
 * is about exactly this, and roughly one man in twelve cannot rely on the
 * difference between the two colours a brand picks.
 *
 * Two rules, both of which Phase 9's criteria ask for. A link with no words
 * has no accessible name: a screen reader announces "link" and nothing else.
 * A link with no destination is not a link at all — the renderer draws a span,
 * so the error is what tells the author why their link is not one.
 */
export const link: ComponentDefinition = {
  type: "core.link",
  name: "Link",
  category: "Navigation",
  interactive: false,
  container: false,
  defaultProps: { text: "Learn more", target: "_self" },
  defaultStyles: {
    color: "{colors.primary}",
    textDecoration: "underline",
    textUnderlineOffset: "0.15em",
    fontFamily: "{typography.fontFamily.body}",
    fontSize: "{typography.scale.body.fontSize}",
    lineHeight: "{typography.scale.body.lineHeight}",
    cursor: "pointer",
  },
  renderer: LinkRenderer,
  validate: (node) => {
    if (hasNoText(node)) return "This link has no text, so there is nothing to announce it by."

    return safeHref(node.props["href"]) === null
      ? "This link has no destination, or one the browser will not follow."
      : null
  },
}
