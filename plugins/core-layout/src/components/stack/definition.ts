import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { StackRenderer } from "./Renderer"

/**
 * Stack's registration.
 *
 * Vertical by default. A checkout is a column of things, and the most common
 * arrangement should be the one nobody has to set.
 */
export const stack: ComponentDefinition = {
  type: "core.stack",
  name: "Stack",
  category: "Layout",
  interactive: false,
  container: true,
  defaultProps: {},
  defaultStyles: {
    display: "flex",
    flexDirection: "column",
    gap: "{spacing.4}",
    alignItems: "stretch",
    justifyContent: "flex-start",
    flexWrap: "nowrap",
  },
  renderer: StackRenderer,
}
