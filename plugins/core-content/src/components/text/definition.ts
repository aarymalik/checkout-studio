import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { hasNoText } from "../text"
import { TextRenderer } from "./Renderer"

/**
 * Text's registration.
 *
 * No validator for emptiness, unlike Heading. An empty paragraph is invisible
 * and announces nothing, so it costs a user nothing to leave one behind while
 * they work — and a publish blocked on it would be the editor refusing to save
 * a page somebody is halfway through. An empty heading is the opposite: it
 * takes a line and is announced as a heading with no text.
 */
export const text: ComponentDefinition = {
  type: "core.text",
  name: "Text",
  category: "Typography",
  interactive: false,
  container: false,
  defaultProps: { text: "Text" },
  defaultStyles: {
    fontFamily: "{typography.fontFamily.body}",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.body.fontWeight}",
    lineHeight: "{typography.scale.body.lineHeight}",
    color: "{colors.foreground}",
    textAlign: "start",
    margin: "0",
    /*
     * A typed line break is a line break.
     *
     * Without this a paragraph written over three lines renders as one, and
     * there is nothing on screen to explain it. `pre-wrap` rather than `pre`,
     * so the text still wraps at the edge of its column.
     */
    whiteSpace: "pre-wrap",
  },
  renderer: TextRenderer,
}

/** Exported for the tests that check this is the one rule Text does not have. */
export const textIsEmpty = hasNoText
