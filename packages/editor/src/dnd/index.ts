/**
 * Drag and drop.
 *
 * The arithmetic and the rules, with no sensors and no React. Phase 8 asks for
 * 100% coverage on collision and validity, and both are answerable without a
 * browser — which is also what keeps the rule for a nested container a product
 * decision rather than a property of whatever library moves the pointer.
 *
 * See docs/phases.md Phase 8.
 */

export { useDrag } from "./hooks"
export type { DragControls, UseDragOptions } from "./hooks"

export { edgeBand, indexWithin, resolveDrop } from "./resolve"
export type { Drop, DropPosition, ResolveOptions } from "./resolve"

export { canDrop, dropRejection } from "./validity"
export type { DropRules, Rejection, RejectionCode } from "./validity"

export { indicatorFor } from "./indicator"
export type { Indicator } from "./indicator"
