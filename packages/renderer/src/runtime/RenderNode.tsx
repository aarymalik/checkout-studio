import type { Node } from "@checkout-studio/schema"
import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"
import type { AppError } from "@checkout-studio/utils"
import type { ReactElement, ReactNode } from "react"

import { NodeErrorBoundary } from "../fallback/NodeErrorBoundary"
import { Unsupported } from "../fallback/Unsupported"
import type { RenderContext } from "./context"
import { planNode } from "./plan"
import { resolveProps } from "./props"

/**
 * The tree walker.
 *
 * Recursive, with no depth limit — a node's children render its children's
 * children, and a hundred levels is a hundred levels. Children render in stored
 * order, always, because the order is the document's and not this loop's.
 *
 * No hooks, no state, no effects. It is a function from a node id and a context
 * to an element, which is what lets it run as a server component: a static
 * component rendered through here ships no JavaScript to the visitor, so
 * "hydrate only interactive components" falls out of the architecture rather
 * than being arranged.
 *
 * See docs/renderer.md § Recursive Rendering.
 */

export interface RenderNodeProps {
  nodeId: string
  context: RenderContext
  onError?: ((error: AppError, nodeId: string) => void) | undefined
}

export function RenderNode({ nodeId, context, onError }: RenderNodeProps): ReactElement | null {
  const plan = planNode(nodeId, context)

  if (plan === null) return null

  const { node, definition, className } = plan

  if (definition === null) {
    context.warn({
      code: "component-not-registered",
      nodeId: node.id,
      message: `No component is registered for "${node.type}".`,
    })

    return <Unsupported type={node.type} className={className} mode={context.mode} />
  }

  // Resolved before the component is constructed, so a node whose styles cannot
  // resolve is reported even when the component then throws.
  context.styles(node, definition)

  const Component = definition.renderer

  return (
    <NodeErrorBoundary
      nodeId={node.id}
      componentName={definition.name}
      className={className}
      mode={context.mode}
      onError={onError}
    >
      <Component
        node={node}
        props={resolveProps(node, context, definition.defaultProps)}
        className={className}
        mode={context.mode}
      >
        {renderChildren(node, definition, context, onError)}
      </Component>
    </NodeErrorBoundary>
  )
}

function renderChildren(
  node: Node,
  definition: ComponentDefinition,
  context: RenderContext,
  onError: ((error: AppError, nodeId: string) => void) | undefined,
): ReactNode {
  if (node.children.length === 0) return null

  // A component that does not hold children renders none, whatever the document
  // says — and a document can say anything, having possibly been imported or
  // authored against a version where the component did take them.
  if (!definition.container) return null

  return node.children.map((childId) => (
    <RenderNode key={childId} nodeId={childId} context={context} onError={onError} />
  ))
}
