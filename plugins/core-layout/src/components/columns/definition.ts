import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { columnTracks } from "../grid/definition"
import { ColumnsRenderer } from "./Renderer"

/**
 * Columns' registration.
 *
 * ## How this differs from Grid, and why both exist
 *
 * Grid is two-dimensional: a count of columns that children flow into, row by
 * row, with the flow itself editable. Columns is one row of equal columns — the
 * thing a page is made of when a product sits beside its description.
 *
 * The catalog lists them separately and both earn it, but the overlap is real
 * and worth saying out loud: Columns is a Grid with the two-dimensional
 * controls left out and one of them turned into the thing people actually mean.
 *
 * ## "Responsive Collapse", as built
 *
 * The catalog lists it as an editable. It is not a setting here, because it
 * does not need to be: Columns is responsive, so collapsing is setting it to
 * one column at the mobile breakpoint. A separate switch would be a second way
 * to say the same thing, and the two would disagree the first time somebody
 * used both.
 */
export const columns: ComponentDefinition = {
  type: "core.columns",
  name: "Columns",
  category: "Layout",
  interactive: false,
  container: true,
  defaultProps: {},
  defaultStyles: {
    display: "grid",
    // Two, because one column is not columns.
    gridTemplateColumns: columnTracks(2),
    gap: "{spacing.6}",
    alignItems: "start",
  },
  renderer: ColumnsRenderer,
}
