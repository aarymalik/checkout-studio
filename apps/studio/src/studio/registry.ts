import { emptyRegistry } from "@checkout-studio/plugin-sdk"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"

/**
 * The registry the canvas renders through.
 *
 * The same shape the published route builds, and for the same reason: the
 * canvas and the live page share one rendering path, so they have to share one
 * registry or they would disagree about what a component is.
 *
 * Empty today. The core plugin arrives in Phase 9, so every node currently
 * resolves to the unsupported placeholder — which in editor-preview mode is a
 * visible card naming the missing type, because in the editor the user needs to
 * see the problem to act on it.
 *
 * Built at module scope rather than per render: a registry derives entirely
 * from the plugins in this build, and a new object each render would give the
 * renderer's memoisation a different key to miss against every time.
 */
export const registry: RendererRegistry = emptyRegistry()
