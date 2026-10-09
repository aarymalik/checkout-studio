import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { SpacerRenderer } from "./Renderer"

/**
 * Spacer's registration.
 *
 * `flexShrink: 0`, which is the whole reason this is not just a div with a
 * height. Inside a flex column — which Section, Container and Stack all are —
 * a child with a height and no shrink rule is the first thing the browser
 * squeezes when space runs short. A spacer that silently becomes 4px tall is
 * worse than no spacer, because the page looks wrong somewhere else.
 */
export const spacer: ComponentDefinition = {
  type: "core.spacer",
  name: "Spacer",
  category: "Layout",
  interactive: false,
  container: false,
  defaultProps: {},
  defaultStyles: { height: "{spacing.7}", flexShrink: 0 },
  renderer: SpacerRenderer,
}
