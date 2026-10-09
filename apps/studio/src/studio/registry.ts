import { CURRENT_VERSION } from "@checkout-studio/schema"
import { PluginHost } from "@checkout-studio/plugin-sdk"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"
import { coreContent } from "@checkout-studio/plugin-core-content/renderer"
import { coreLayout } from "@checkout-studio/plugin-core-layout/renderer"

/**
 * The registry the canvas renders through.
 *
 * The same shape the published route builds, and for the same reason: the
 * canvas and the live page share one rendering path, so they have to share one
 * registry or they would disagree about what a component is.
 *
 * Nothing here names a component. The plugins register their own through
 * `PluginApi`, exactly as a third party's would — see docs/plugin-api.md
 * § Plugin Lifecycle. Built synchronously and at module scope, for the reasons
 * set out in apps/renderer/src/registry.ts.
 *
 * `./renderer` here too, although this is the editor. The property definitions
 * in `./editor` belong to the inspector, which arrives in Phase 12; importing
 * them now would put them in the studio bundle before anything reads them.
 */

/** This build's engine version. See the renderer app's registry for why. */
const ENGINE_VERSION = "0.1.0"

export const host = new PluginHost({
  versions: { engine: ENGINE_VERSION, schema: CURRENT_VERSION },
})
  .register(coreLayout)
  .register(coreContent)

export const registry: RendererRegistry = host.startSync()
