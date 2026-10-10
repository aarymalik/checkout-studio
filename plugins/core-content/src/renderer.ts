import type { Plugin, PluginApi } from "@checkout-studio/plugin-sdk"

import { manifest } from "./manifest"
import { badge } from "./components/badge/definition"
import { heading } from "./components/heading/definition"
import { icon } from "./components/icon/definition"
import { image } from "./components/image/definition"
import { text } from "./components/text/definition"
import { video } from "./components/video/definition"
import { headingOrder } from "./validators"

/**
 * The renderer half: component definitions, and the rules about them.
 *
 * The heading-order validator is registered here rather than in the editor
 * half, and deliberately. It is not an inspector concern: publishing runs the
 * same validators the editor shows, so a rule that lived only in the editor
 * half would be a rule the publish path could not see.
 *
 * Importing this must never pull in a property definition. That is the whole
 * reason this package has three entry points, and it is checked rather than
 * hoped for — `scripts/check-renderer-bundle.mjs` measures what a visitor
 * downloads.
 */
export const coreContent: Plugin = {
  manifest,
  activate(api: PluginApi) {
    api.registerComponent(heading)
    api.registerComponent(text)
    api.registerComponent(badge)
    api.registerComponent(image)
    api.registerComponent(video)
    api.registerComponent(icon)
    api.registerDocumentValidator(headingOrder)
  },
}

export { badge, heading, icon, image, text, video }
