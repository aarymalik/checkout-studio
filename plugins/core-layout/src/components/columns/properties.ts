import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Columns: Column Count, Width, Gap, Responsive
 * Collapse.
 *
 * Three of the four are here. "Responsive Collapse" is not a control: the
 * count is responsive, so collapsing is setting it to one at the mobile
 * breakpoint. See the definition for why a second switch would be worse than
 * none.
 */
export const columnsProperties = defineProperties([
  {
    key: "gridTemplateColumns",
    target: "style",
    label: "Column count",
    group: "Layout",
    control: "columns",
    min: 1,
    max: 6,
    help: "Set it to 1 at a breakpoint to stack them there.",
    responsive: true,
  },
  common.width,
  common.gap,
  common.alignItems,
])
