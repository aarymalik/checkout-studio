import type { Node } from "@checkout-studio/schema"
import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { DEFERRED_CLASS, classFor, hideClasses } from "../styles/css"
import { evaluateVisibility } from "../visibility/evaluate"
import type { RenderContext } from "./context"

/**
 * What the renderer decides about a node before touching React.
 *
 * Two walks need these answers: the one that produces the markup and the one
 * that produces the stylesheet. They have to agree — a rule for a node that was
 * skipped is dead weight, and a node with no rule renders unstyled — so the
 * decisions are made once, here, rather than twice in two places that would
 * eventually disagree.
 *
 * Visibility is evaluated here, which is what docs/phases.md means by "rules
 * evaluated before render, never during".
 */

export interface NodePlan {
  node: Node
  /** Null when no component is registered: the node renders as unsupported. */
  definition: ComponentDefinition | null
  /** The node's class, the classes hiding it, and the deferred marker. */
  className: string
  /** Hide classes used, so the stylesheet emits only the rules needed. */
  hiding: readonly string[]
}

/** Null when the node does not exist, or is hidden along with its children. */
export function planNode(nodeId: string, context: RenderContext): NodePlan | null {
  const node = context.document.nodes[nodeId]

  // A child id with no node is a broken document, and validation reports it as
  // an error before anything renders. Rendering nothing is still the right
  // answer if one reaches here: the alternative is a page that will not load.
  if (node === undefined) return null

  const visibility = evaluateVisibility(node, context.conditions)

  // Skipped entirely, children included. A condition the server can decide is
  // decided here, so a node meant for customers in one country is not sitting
  // in everybody else's HTML.
  if (visibility.decision === "hidden") return null

  const hiding = hideClasses(
    visibility.breakpoints,
    context.singleBreakpoint ? { activeBreakpoint: context.breakpoint } : {},
  )

  const className = [
    classFor(node.id),
    ...hiding,
    // Undecidable here: the rule depends on something only the browser knows,
    // such as a field the customer has not filled in. The node renders, and the
    // plugin owning the source toggles it — the class is how it finds the node.
    ...(visibility.decision === "deferred" ? [DEFERRED_CLASS] : []),
  ].join(" ")

  return { node, definition: context.registry.get(node.type) ?? null, className, hiding }
}

/**
 * Every node that will render, in document order.
 *
 * Its own walk rather than the schema's `traverse`, because a hidden subtree has
 * to be skipped whole and `traverse` only offers "stop everything".
 */
export function planTree(context: RenderContext): readonly NodePlan[] {
  const plans: NodePlan[] = []
  const queue: string[] = [context.document.root]

  while (queue.length > 0) {
    const id = queue.shift() as string
    const plan = planNode(id, context)

    if (plan === null) continue

    plans.push(plan)

    if (plan.definition !== null && !plan.definition.container) continue

    // Depth-first, so a node's rules sit next to its children's: CSS
    // specificity is decided by order, and document order is the only order
    // that is the same on every render.
    queue.unshift(...plan.node.children)
  }

  return plans
}
