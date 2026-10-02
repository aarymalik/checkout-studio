import { BREAKPOINTS } from "@checkout-studio/schema"
import type { Breakpoint } from "@checkout-studio/schema"

/**
 * The device frames.
 *
 * The same three widths the renderer's breakpoints are derived from, so what a
 * user arranges inside a frame is what a visitor at that width receives. One
 * set of numbers, in docs/phases.md, reached from both sides.
 *
 * The frame has a width and no height: a checkout is as long as its content, and
 * a fixed height would either crop the page or invent whitespace below it. What
 * the canvas measures instead is how tall the rendered page turned out.
 */

export const FRAME_WIDTH: Record<Breakpoint, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 390,
}

/** Shown beside the frame, so the user knows what they are looking at. */
export const FRAME_LABEL: Record<Breakpoint, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
}

/** What a frame occupies in canvas space, given the height its content came out at. */
export function frameRect(
  breakpoint: Breakpoint,
  contentHeight: number,
): {
  x: number
  y: number
  width: number
  height: number
} {
  return {
    x: 0,
    y: 0,
    width: FRAME_WIDTH[breakpoint],
    // A page with nothing in it still needs a frame to look at, and a
    // zero-height one would make zoom-to-fit divide by nothing.
    height: Math.max(1, contentHeight),
  }
}

/** The next frame in `direction`, wrapping — what the device switcher's arrow keys do. */
export function adjacentFrame(breakpoint: Breakpoint, direction: 1 | -1): Breakpoint {
  const index = BREAKPOINTS.indexOf(breakpoint)
  const next = (index + direction + BREAKPOINTS.length) % BREAKPOINTS.length

  return BREAKPOINTS[next] as Breakpoint
}
