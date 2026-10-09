import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { GridRenderer } from "./Renderer"

/** The track list a column count means. See the `columns` control in plugin-sdk. */
export function columnTracks(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`
}

/**
 * Grid's registration.
 *
 * Two columns by default: one is a Stack with extra steps, and three is a
 * decision about content nobody has written yet.
 */
export const grid: ComponentDefinition = {
  type: "core.grid",
  name: "Grid",
  category: "Layout",
  interactive: false,
  container: true,
  defaultProps: {},
  defaultStyles: {
    display: "grid",
    /*
     * `minmax(0, 1fr)` rather than `1fr`.
     *
     * A bare `1fr` floors at the content's minimum size, so one long unbroken
     * string — an order id, a URL — makes its column wider than its share and
     * pushes the rest of the grid off the page. This is the single most common
     * CSS grid bug and it only shows up with real data.
     */
    gridTemplateColumns: columnTracks(2),
    gap: "{spacing.5}",
    alignItems: "stretch",
    gridAutoFlow: "row",
  },
  renderer: GridRenderer,
}
