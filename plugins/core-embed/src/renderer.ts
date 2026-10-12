import type { Plugin, PluginApi } from "@checkout-studio/plugin-sdk"

import { manifest } from "./manifest"
import { codeBlock } from "./components/code-block/definition"
import { htmlBlock } from "./components/html-block/definition"

/**
 * The renderer half: component definitions, and the rules about them.
 *
 * Importing this must never pull in the HTML parser. The parser is reachable
 * from `./editor` alone, which is what keeps `DOMParser` and an allowlist walk
 * out of a page a customer is paying on — measured by
 * `scripts/check-renderer-bundle.mjs` rather than assumed.
 */
export const coreEmbed: Plugin = {
  manifest,
  activate(api: PluginApi) {
    api.registerComponent(htmlBlock)
    api.registerComponent(codeBlock)
  },
}

export { codeBlock, htmlBlock }
