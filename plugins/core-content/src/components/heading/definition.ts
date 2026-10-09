import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { hasNoText } from "../text"
import { HeadingRenderer } from "./Renderer"

/**
 * Heading's registration.
 *
 * Level 2 by default, not 1. A page has one level-1 heading — its title — and
 * a component that claimed to be it every time it was inserted would leave a
 * page of four h1s, which is an outline that says everything is the top. The
 * document validator in `validators.ts` warns when a page has no h1 at all, so
 * the default is safe rather than silent.
 *
 * Its size default references the theme's scale, so a heading looks like the
 * brand's h2 rather than like a number somebody typed here.
 */
export const heading: ComponentDefinition = {
  type: "core.heading",
  name: "Heading",
  category: "Typography",
  interactive: false,
  container: false,
  defaultProps: { text: "Heading", level: 2 },
  defaultStyles: {
    fontFamily: "{typography.fontFamily.heading}",
    fontSize: "{typography.scale.h2.fontSize}",
    fontWeight: "{typography.scale.h2.fontWeight}",
    lineHeight: "{typography.scale.h2.lineHeight}",
    letterSpacing: "{typography.scale.h2.letterSpacing}",
    color: "{colors.foreground}",
    textAlign: "start",
    margin: "0",
  },
  renderer: HeadingRenderer,
  /*
   * An empty heading is worse than a missing one: it takes a line, it is
   * announced as a heading, and it says nothing. Phase 9's tests require this
   * rule by name.
   */
  validate: (node) => (hasNoText(node) ? "This heading has no text." : null),
}
