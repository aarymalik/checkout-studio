import type { Plugin, PluginApi } from "@checkout-studio/plugin-sdk"

import { manifest } from "./manifest"
import { page } from "./components/page/definition"
import { section } from "./components/section/definition"

/**
 * The renderer half: component definitions and nothing else.
 *
 * This is what both applications install. Importing it must never pull in a
 * property definition, an icon or a preview — that is the whole reason this
 * package has three entry points, and it is checked rather than hoped for:
 * `scripts/check-renderer-bundle.mjs` measures what a visitor downloads, and
 * Phase 9's exit criteria hold the published checkout under 150 KB.
 *
 * Registration goes through `PluginApi` like any third party's would. The
 * plugin cannot see the registry it is writing into and cannot see another
 * plugin, which is what makes "the engine knows nothing about components" a
 * property of the code rather than a description of our intentions.
 */
export const coreLayout: Plugin = {
  manifest,
  activate(api: PluginApi) {
    api.registerComponent(page)
    api.registerComponent(section)
  },
}

export { page, section }
