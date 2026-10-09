import { isSafeCssValue } from "@checkout-studio/schema"
import type { CSSProperties } from "react"

/**
 * A text gradient, as the three declarations it actually is.
 *
 * The catalog lists Gradient as editable on a Heading, and there is no single
 * CSS property for it: the gradient is painted as a background, clipped to the
 * glyphs, and the text's own colour is made transparent so the background shows
 * through. A property definition cannot express three keys, so this is a prop
 * and the component assembles it.
 *
 * Both the prefixed and the standard `background-clip` are emitted. Safari
 * still needs `-webkit-`, and a heading that renders as a solid block of
 * colour because one of them was missing is unreadable rather than unstyled.
 *
 * A value that fails the schema's own CSS guard produces nothing. It is
 * interpolated into a declaration, so a value carrying a semicolon could end
 * this one and begin another — and a heading that silently keeps its colour is
 * a far better outcome on a payments page than one that brought a declaration
 * with it.
 */
export function textGradientStyle(value: unknown): CSSProperties {
  if (typeof value !== "string" || !isSafeCssValue(value)) return {}

  return {
    backgroundImage: value,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  }
}
