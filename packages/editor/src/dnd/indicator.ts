import { rectToScreen, type Rect, type Transform } from "../canvas/transform"
import type { DropPosition } from "./resolve"

/**
 * Where to draw the thing that says "here".
 *
 * Two shapes, because a drop means two different things. Between siblings it is
 * a line on the edge the node would arrive at; inside a container it is the
 * container's own outline, because there is no edge to point at — the answer is
 * "in there", and a line drawn somewhere inside it would be a claim about which
 * part.
 *
 * Projected to screen space here rather than drawn in canvas space and scaled
 * with it. A 2px line inside a scaled layer is 0.2px at 10% zoom and 8px at
 * 400% — invisible when the user most needs it and a slab when they least do.
 * The geometry scales; the stroke does not.
 *
 * See docs/editor-behavior.md § Drag & Drop and docs/ui-guidelines.md.
 */

/** A line to draw, in screen pixels. Thickness is the renderer's business. */
export interface Indicator {
  shape: "line" | "outline"
  x: number
  y: number
  /** For a line between siblings, the length. For an outline, the box. */
  width: number
  height: number
}

/**
 * The indicator for a drop against `rect`.
 *
 * `rect` is the resolved node's box in canvas space — the node the drop was
 * resolved against, which for an `inside` drop is the container itself.
 */
export function indicatorFor(rect: Rect, position: DropPosition, transform: Transform): Indicator {
  const screen = rectToScreen(rect, transform)

  if (position === "inside") {
    return {
      shape: "outline",
      x: screen.x,
      y: screen.y,
      width: screen.width,
      height: screen.height,
    }
  }

  return {
    shape: "line",
    x: screen.x,
    // On the edge itself, not inside it. A line drawn a pixel in reads as
    // belonging to the node rather than to the gap beside it.
    y: position === "before" ? screen.y : screen.y + screen.height,
    width: screen.width,
    height: 0,
  }
}
