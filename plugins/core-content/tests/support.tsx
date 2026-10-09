import type { ComponentDefinition, RenderMode } from "@checkout-studio/plugin-sdk"
import type { Node } from "@checkout-studio/schema"
import { render } from "@testing-library/react"
import type { RenderResult } from "@testing-library/react"
import type { JSX, ReactNode } from "react"

/** A node of this type, with whatever the test cares about overridden. */
export function nodeOf(type: string, overrides: Partial<Node> = {}): Node {
  return {
    id: "nod_test",
    type,
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: {},
    ...overrides,
  } as Node
}

/**
 * A component's renderer, as the renderer would call it.
 *
 * Not through `CheckoutRenderer`: that would test the engine's cascade as well,
 * and the engine has its own tests for it. What a component owns is the element
 * it emits and what it does with resolved props — so that is what is handed in.
 *
 * `defaultProps` when the test names none, because that is what the renderer
 * does: `RenderNode` resolves a node's props over the definition's defaults. A
 * harness that handed `{}` instead was testing a component in a state the
 * product cannot produce — and the axe pass noticed, reporting an empty
 * heading for a component whose default text is "Heading".
 */
export function renderComponent(
  definition: ComponentDefinition,
  options: {
    props?: Record<string, unknown>
    children?: ReactNode
    mode?: RenderMode
    node?: Partial<Node>
  } = {},
): RenderResult {
  const Renderer = definition.renderer

  return render(
    (
      <Renderer
        node={nodeOf(definition.type, options.node ?? {})}
        props={options.props ?? definition.defaultProps}
        className="ck-test"
        children={options.children}
        mode={options.mode ?? "published"}
      />
    ) as JSX.Element,
  )
}
