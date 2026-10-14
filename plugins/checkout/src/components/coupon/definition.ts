import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { CouponRenderer } from "./Renderer"
import { COUPON_STYLES } from "./styles"

/**
 * Coupon's registration.
 *
 * `interactive: true` and unavoidably so: somebody types into it, and what
 * they typed has to be remembered, sent, and answered.
 *
 * No `defaultProps` for the messages. Each falls back inside the renderer, so
 * a merchant who clears one gets the sentence back rather than an empty
 * paragraph where an explanation should be.
 */
export const coupon: ComponentDefinition = {
  type: "checkout.coupon",
  name: "Coupon",
  category: "Checkout",
  interactive: true,
  container: false,
  defaultProps: {
    label: "Discount code",
    placeholder: "Enter a code",
    buttonLabel: "Apply",
  },
  defaultStyles: { display: "block", width: "100%" },
  descendantStyles: COUPON_STYLES,
  renderer: CouponRenderer,
}
