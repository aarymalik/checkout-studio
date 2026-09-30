import { emptyRegistry } from "@checkout-studio/plugin-sdk"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"

/**
 * The registry, built once, in one module.
 *
 * Imported by both the server and the client module graph, which is what keeps
 * them from disagreeing about what `core.button` is — a component registered on
 * one side and not the other is a hydration mismatch with a very unhelpful
 * error message. See docs/renderer.md § SSR.
 *
 * Empty today. The engine ships no components: the core plugin arrives in Phase
 * 9 and the checkout plugin in Phase 11, and each registers its own through
 * plugin-sdk. Until then every node resolves to the unsupported fallback, which
 * renders nothing on a published page and keeps its space.
 *
 * Built at module scope rather than per request. A registry is derived entirely
 * from the plugins installed in this build, so building one per request would
 * do the same work for every visitor and give the renderer's memoisation a
 * different object to key against each time.
 */
export const registry: RendererRegistry = emptyRegistry()
