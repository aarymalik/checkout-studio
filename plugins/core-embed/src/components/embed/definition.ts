import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { EmbedRenderer } from "./Renderer"
import { providerOf, srcFor } from "./providers"

/**
 * Embed's registration.
 *
 * `interactive: false`: an iframe is an element and everything inside it is
 * the provider's, so nothing here hydrates.
 *
 * The aspect ratio is the provider's where it has one and the author's
 * otherwise — a booking page is as tall as it is. Without a ratio a frame is
 * a box of unknown height and the page jumps when it loads, which is most of
 * the CLS budget in docs/performance.md.
 */
export const embed: ComponentDefinition = {
  type: "core.embed",
  name: "Embed",
  category: "Media",
  interactive: false,
  container: false,
  defaultProps: { provider: "youtube", id: "" },
  defaultStyles: {
    display: "block",
    width: "100%",
    border: "none",
    aspectRatio: "16 / 9",
    borderRadius: "{radius.none}",
    backgroundColor: "{colors.surfaceRaised}",
  },
  renderer: EmbedRenderer,
  validate: (node) => {
    const provider = providerOf(node.props["provider"])

    if (provider === null) return "This embed has no provider."

    return srcFor(provider, node.props["id"]) === null
      ? `This ${provider.label} embed has no ${provider.idLabel.toLowerCase()}.`
      : null
  },
}
