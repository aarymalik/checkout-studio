import type { Plugin, PluginApi } from "@checkout-studio/plugin-sdk"

import { manifest } from "./manifest"
import { embedBesidePayment } from "./validators"
import { codeBlock } from "./components/code-block/definition"
import { embed } from "./components/embed/definition"
import { htmlBlock } from "./components/html-block/definition"

/**
 * The renderer half: component definitions, and the rules about them.
 *
 * The embed rule is registered here rather than in the editor half, for the
 * reason core-content's heading order is: publishing runs the same validators
 * the editor shows, so a rule that lived only in the editor half would be a
 * rule the publish path could not see.
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
    api.registerComponent(embed)
    api.registerDocumentValidator(embedBesidePayment)
  },
}

export { codeBlock, embed, htmlBlock }
