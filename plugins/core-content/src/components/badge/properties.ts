import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Badge: Text, Colour, Background, Radius, Icon.
 *
 * Four of the five. Icon is not here: it would need the icon set, which belongs
 * to `core.icon`, and a badge holding a component would be a container — which
 * a badge is not. A Stack with an Icon and a Badge in it already does this.
 */
export const badgeProperties = defineProperties([
  common.text,
  common.color,
  common.backgroundColor,
  common.borderRadius,
  common.padding,
])
