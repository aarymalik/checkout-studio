import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { TestimonialRenderer } from "./Renderer"
import { TESTIMONIAL_STYLES } from "./styles"

/**
 * Testimonial's registration.
 *
 * `interactive: false`: somebody's words, which do not change while they are
 * being read.
 */
export const testimonial: ComponentDefinition = {
  type: "marketing.testimonial",
  name: "Testimonial",
  category: "Marketing",
  interactive: false,
  container: false,
  defaultProps: {
    quote: "It arrived two days early and the quality is better than I expected.",
    name: "Sam Okafor",
    role: "Verified buyer",
    rating: 5,
  },
  defaultStyles: { display: "block", width: "100%", margin: "0" },
  descendantStyles: TESTIMONIAL_STYLES,
  renderer: TestimonialRenderer,
}
