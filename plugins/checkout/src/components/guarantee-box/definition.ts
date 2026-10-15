import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { GuaranteeBoxRenderer } from "./Renderer"
import { GUARANTEE_STYLES } from "./styles"

/** Guarantee Box's registration. Static, like the badges beside it. */
export const guaranteeBox: ComponentDefinition = {
  type: "checkout.guarantee-box",
  name: "Guarantee Box",
  category: "Checkout",
  interactive: false,
  container: false,
  defaultProps: {
    icon: "shield",
    title: "30-day money-back guarantee",
    description: "Not what you hoped for? Send it back within 30 days for a full refund.",
  },
  defaultStyles: {
    display: "flex",
    alignItems: "flex-start",
    gap: "{spacing.3}",
    padding: "{spacing.4}",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "{colors.border}",
    borderRadius: "{radius.md}",
    backgroundColor: "{colors.surfaceRaised}",
    width: "100%",
  },
  descendantStyles: GUARANTEE_STYLES,
  renderer: GuaranteeBoxRenderer,
}
