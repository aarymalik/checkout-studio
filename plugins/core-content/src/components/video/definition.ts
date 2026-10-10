import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { assetOf } from "../image/Renderer"
import { VideoRenderer } from "./Renderer"

/**
 * Video's registration.
 *
 * `interactive: false`, which looks wrong for a video and is not. The flag
 * means "this ships JavaScript to a published page": a `<video>` with controls
 * is played, paused and scrubbed by the browser, and none of that is ours. A
 * component that declared itself interactive without needing to would put
 * React on a checkout to do what an element already does — the easiest way
 * there is to spend the bundle budget, per docs/renderer.md § SSR.
 */
export const video: ComponentDefinition = {
  type: "core.video",
  name: "Video",
  category: "Media",
  interactive: false,
  container: false,
  defaultProps: { controls: true, autoplay: false, loop: false, muted: false },
  defaultStyles: {
    display: "block",
    width: "100%",
    height: "auto",
    // A player with nothing loaded is a black box of unknown height otherwise,
    // and the page jumps when the metadata arrives.
    aspectRatio: "16 / 9",
    borderRadius: "{radius.none}",
    backgroundColor: "{colors.surfaceRaised}",
  },
  renderer: VideoRenderer,
  validate: (node) => (assetOf(node.props["src"]) === null ? "This video has no source." : null),
}
