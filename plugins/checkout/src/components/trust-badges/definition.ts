import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { TrustBadgesRenderer } from "./Renderer"
import { TRUST_STYLES } from "./styles"

/**
 * Trust Badges' registration.
 *
 * `interactive: false`. It reads no quote and remembers nothing, so a
 * published page renders it on the server and downloads not a byte for it.
 *
 * The defaults are the three things a checkout most often needs to say. A
 * merchant who wants different ones replaces them; a merchant who drops one on
 * a page and changes nothing still gets something true.
 */
export const trustBadges: ComponentDefinition = {
  type: "checkout.trust-badges",
  name: "Trust Badges",
  category: "Checkout",
  interactive: false,
  container: false,
  defaultProps: {
    badges: [
      { icon: "lock", text: "Secure checkout" },
      { icon: "truck", text: "Tracked delivery" },
      { icon: "shield", text: "Money-back guarantee" },
    ],
  },
  defaultStyles: {
    display: "flex",
    flexWrap: "wrap",
    gap: "{spacing.4}",
    listStyle: "none",
    margin: "0",
    padding: "0",
  },
  descendantStyles: TRUST_STYLES,
  renderer: TrustBadgesRenderer,
}
