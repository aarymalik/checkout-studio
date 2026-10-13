import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { FIELD_STYLES } from "../../form/styles"
import { AddressRenderer } from "./Renderer"
import { partsOf } from "./parts"

/**
 * Address's registration.
 *
 * `validate` asks the question only this component can get wrong: an address
 * with every part switched off is a component that renders nothing and looks
 * finished on the canvas.
 */
export const address: ComponentDefinition = {
  type: "core.address",
  name: "Address",
  category: "Forms",
  interactive: true,
  container: false,
  defaultProps: { required: true },
  defaultStyles: { display: "block", width: "100%" },
  descendantStyles: FIELD_STYLES,
  renderer: AddressRenderer,
  validate: (node) =>
    partsOf(node.props, node.id).length === 0
      ? "This address asks for nothing. Switch at least one part on."
      : null,
}
