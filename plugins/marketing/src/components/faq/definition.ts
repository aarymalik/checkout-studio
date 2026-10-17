import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { FaqRenderer } from "./Renderer"
import { FAQ_STYLES } from "./styles"

/**
 * FAQ's registration.
 *
 * `interactive: false`, which is the whole point of using `<details>`: the
 * opening, the keyboard, the announcement and find-in-page are the browser's,
 * so a published page downloads nothing for any of it.
 */
export const faq: ComponentDefinition = {
  type: "marketing.faq",
  name: "FAQ",
  category: "Marketing",
  interactive: false,
  container: false,
  defaultProps: {
    items: [
      { question: "When will it arrive?", answer: "Within three to five working days." },
      { question: "Can I return it?", answer: "Within 30 days, for a full refund." },
    ],
  },
  defaultStyles: { display: "block", width: "100%" },
  descendantStyles: FAQ_STYLES,
  renderer: FaqRenderer,
}
