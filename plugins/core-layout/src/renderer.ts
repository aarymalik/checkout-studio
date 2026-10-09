import type { Plugin, PluginApi } from "@checkout-studio/plugin-sdk"

import { manifest } from "./manifest"
import { columns } from "./components/columns/definition"
import { container } from "./components/container/definition"
import { divider } from "./components/divider/definition"
import { grid } from "./components/grid/definition"
import { page } from "./components/page/definition"
import { section } from "./components/section/definition"
import { spacer } from "./components/spacer/definition"
import { stack } from "./components/stack/definition"

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
    // The page first, because it is every document's root and the one a
    // missing registration is most visible in.
    api.registerComponent(page)
    api.registerComponent(section)
    api.registerComponent(container)
    api.registerComponent(grid)
    api.registerComponent(stack)
    api.registerComponent(columns)
    api.registerComponent(spacer)
    api.registerComponent(divider)
  },
}

export { columns, container, divider, grid, page, section, spacer, stack }
