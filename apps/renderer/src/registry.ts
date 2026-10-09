import { CURRENT_VERSION } from "@checkout-studio/schema"
import { PluginHost } from "@checkout-studio/plugin-sdk"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"
import { coreContent } from "@checkout-studio/plugin-core-content/renderer"
import { coreLayout } from "@checkout-studio/plugin-core-layout/renderer"

/**
 * The registry, built once, in one module.
 *
 * Imported by both the server and the client module graph, which is what keeps
 * them from disagreeing about what `core.button` is — a component registered on
 * one side and not the other is a hydration mismatch with a very unhelpful
 * error message. See docs/renderer.md § SSR.
 *
 * Built at module scope rather than per request. A registry is derived entirely
 * from the plugins installed in this build, so building one per request would
 * do the same work for every visitor and give the renderer's memoisation a
 * different object to key against each time.
 *
 * ## Built by activating plugins, not by listing components
 *
 * Nothing here names a component. The plugins register their own through
 * `PluginApi`, exactly as a third party's would, which is what makes "the
 * engine knows nothing about checkout" a property of the code rather than a
 * description of our intentions — see docs/plugin-api.md § Plugin Lifecycle.
 *
 * Synchronously, because this module is imported by both module graphs and a
 * registry that arrived a tick later would be a first paint full of unsupported
 * placeholders. `startSync` refuses a plugin that activates asynchronously
 * rather than half-activating it.
 *
 * A plugin that fails to activate costs its own components and nothing else:
 * the host discards its registrations whole and carries on, so one broken
 * plugin is not a blank page. What happened to each is on `host.records()`.
 *
 * Only `./renderer` is imported. The editor half of a plugin holds property
 * definitions, and a visitor to a checkout has no use for them — Phase 9's exit
 * criteria hold that the renderer bundle contains no editor-only code.
 */

/**
 * This build's engine version, which a plugin declares compatibility against.
 *
 * A constant rather than the package version: every private workspace package
 * reports `0.0.0`, and a plugin whose floor is `0.1.0` would be disabled by it.
 */
const ENGINE_VERSION = "0.1.0"

export const host = new PluginHost({
  versions: { engine: ENGINE_VERSION, schema: CURRENT_VERSION },
})
  .register(coreLayout)
  .register(coreContent)

export const registry: RendererRegistry = host.startSync()
