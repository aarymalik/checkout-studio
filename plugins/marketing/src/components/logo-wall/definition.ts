import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { LogoWallRenderer } from "./Renderer"
import { LOGO_STYLES } from "./styles"

/**
 * Logo Wall's registration.
 *
 * No default logos. A wall of invented brands is a claim the merchant has not
 * made, and one that would be easy to publish by accident.
 */
export const logoWall: ComponentDefinition = {
  type: "marketing.logo-wall",
  name: "Logo Wall",
  category: "Marketing",
  interactive: false,
  container: false,
  defaultProps: {},
  defaultStyles: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    alignItems: "center",
    gap: "{spacing.5}",
    listStyle: "none",
    margin: "0",
    padding: "0",
    width: "100%",
  },
  descendantStyles: LOGO_STYLES,
  renderer: LogoWallRenderer,
}
