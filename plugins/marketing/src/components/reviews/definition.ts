import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { ReviewsRenderer } from "./Renderer"
import { REVIEWS_STYLES } from "./styles"

/** Reviews' registration. A summary of what other people said. */
export const reviews: ComponentDefinition = {
  type: "marketing.reviews",
  name: "Reviews",
  category: "Marketing",
  interactive: false,
  container: false,
  defaultProps: { rating: 4.8, max: 5, count: 1204, source: "Trustpilot" },
  defaultStyles: { display: "block" },
  descendantStyles: REVIEWS_STYLES,
  renderer: ReviewsRenderer,
}
