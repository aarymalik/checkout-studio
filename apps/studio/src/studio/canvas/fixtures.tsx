import { RegistryBuilder } from "@checkout-studio/plugin-sdk"
import type {
  ComponentDefinition,
  ComponentRenderProps,
  RendererRegistry,
} from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

/**
 * Components for the canvas to draw, for the tests that need one drawn.
 *
 * The registry this build ships is empty until the component library lands, so
 * the canvas never mounts in the running application — and the canvas is where
 * resizing, alignment guides, auto-scroll and zoom-to-fit all live.
 *
 * docs/phases.md Phase 7 names this way out: "Benchmarks run in a harness that
 * registers fixture components from the test suite", and the integration tests
 * are specified the same way. These are those components.
 *
 * Deliberately dull. They are boxes with a declared size, because what is being
 * tested is the canvas around them — a fixture that drew anything interesting
 * would make a failure ambiguous between the canvas and the fixture.
 */

/**
 * A box that renders its children.
 *
 * The children matter: a container that dropped them would render a one-node
 * page however deep the document, and the canvas tests need something nested to
 * measure. `data-ck-node` is what the canvas resolves a click to, so the
 * fixture carries it exactly as a real component must.
 */
function Box({ node, className, children }: ComponentRenderProps): ReactElement {
  return (
    <div className={className} data-ck-node={node.id} data-fixture={node.type}>
      {children}
    </div>
  )
}

function definition(overrides: Partial<ComponentDefinition> & { type: string }) {
  return {
    name: overrides.type,
    interactive: false,
    container: false,
    defaultProps: {},
    defaultStyles: {},
    renderer: Box,
    ...overrides,
  } satisfies ComponentDefinition
}

/**
 * The page root, a section, a heading and a button.
 *
 * `core.page` is the type `createDocument` gives every root, so leaving it out
 * renders the whole document as one unsupported card — which looks exactly like
 * the fixtures not working.
 */
export const FIXTURE_TYPES = ["core.page", "core.section", "core.heading", "core.button"] as const

export function fixtureRegistry(): RendererRegistry {
  const builder = new RegistryBuilder("core")

  builder.component(definition({ type: "core.page", container: true }))
  builder.component(
    definition({ type: "core.section", container: true, defaultStyles: { minHeight: 120 } }),
  )
  builder.component(definition({ type: "core.heading" }))
  builder.component(definition({ type: "core.button", interactive: true }))

  return builder.build()
}
