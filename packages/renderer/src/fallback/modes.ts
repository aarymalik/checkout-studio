import type { RenderMode } from "@checkout-studio/plugin-sdk"

/**
 * What each mode does when something goes wrong.
 *
 * The published checkout has the strictest requirement in the product: **it
 * must always render**. A broken component costs one section; a blank page
 * costs the whole sale. So production shows the customer nothing and reports
 * everything, while the editor shows the user the problem — because in the
 * editor the problem is theirs to fix, and on a live checkout our internals are
 * none of the customer's business.
 *
 * One rule is not a mode difference, so it is not in the table: a failed node
 * always keeps its box. Every mode reserves the space. A live page that
 * reflowed around a missing section would spend the CLS budget in
 * docs/performance.md on an error nobody can see, and the canvas pins selection
 * overlays and resize handles to a node's box, so a collapsed one puts them in
 * the wrong place.
 *
 * See docs/error-handling.md § Renderer Error Handling.
 */

export interface ModeBehaviour {
  /** Show the user what failed, with the component's name. */
  visibleFallbacks: boolean
  /** Resolve one breakpoint in JavaScript instead of emitting media queries. */
  singleBreakpoint: boolean
}

export const MODES: Record<RenderMode, ModeBehaviour> = {
  "editor-preview": { visibleFallbacks: true, singleBreakpoint: true },
  published: { visibleFallbacks: false, singleBreakpoint: false },
  static: { visibleFallbacks: false, singleBreakpoint: false },
  embed: { visibleFallbacks: false, singleBreakpoint: false },
}

export function behaviourOf(mode: RenderMode): ModeBehaviour {
  return MODES[mode]
}
