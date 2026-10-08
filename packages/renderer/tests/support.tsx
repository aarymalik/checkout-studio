import { DEFAULT_THEME_ID, createDocument, defaultTheme } from "@checkout-studio/schema"
import type {
  Breakpoint,
  CheckoutSchema,
  CheckoutTheme,
  Node,
  ResponsiveStyles,
  StyleProperties,
} from "@checkout-studio/schema"
import { RegistryBuilder } from "@checkout-studio/plugin-sdk"
import type {
  ComponentDefinition,
  ComponentRenderProps,
  RendererRegistry,
} from "@checkout-studio/plugin-sdk"
import type { ReactNode } from "react"
import { z } from "zod"

import { createRenderContext } from "../src/runtime/context"
import type { RenderContext, RenderContextInput } from "../src/runtime/context"

/**
 * Fixtures.
 *
 * The engine ships no components, so every component here is invented for the
 * test. That is the arrangement docs/phases.md asks for: the renderer is tested
 * against fixtures registered from the test suite, and real components arrive in
 * Phase 9.
 */

export const theme: CheckoutTheme = defaultTheme

/** A component that renders a div and its children. Container, static. */
export function Box({ className, children }: ComponentRenderProps): ReactNode {
  return <div className={className}>{children}</div>
}

/** A component that renders nothing but its text prop. Not a container. */
export function Leaf({ className, props }: ComponentRenderProps): ReactNode {
  return <span className={className}>{String(props["text"] ?? "")}</span>
}

export function definition(
  type: string,
  overrides: Partial<ComponentDefinition> = {},
): ComponentDefinition {
  return {
    type,
    name: type.slice(type.indexOf(".") + 1),
    category: "Utility",
    interactive: false,
    container: true,
    defaultProps: {},
    defaultStyles: {},
    renderer: Box,
    ...overrides,
  }
}

export function registryWith(...definitions: readonly ComponentDefinition[]): RendererRegistry {
  const builder = new RegistryBuilder()

  for (const entry of definitions) builder.component(entry)

  return builder.build()
}

/** A registry that knows the three fixture types the documents below use. */
export function standardRegistry(): RendererRegistry {
  return registryWith(
    definition("core.page"),
    definition("core.section"),
    definition("core.text", { container: false, renderer: Leaf }),
  )
}

export interface NodeSpec {
  id: string
  type?: string
  children?: readonly string[]
  styles?: ResponsiveStyles
  props?: Node["props"]
  visibility?: Partial<Node["visibility"]>
}

/**
 * A document built from a flat list.
 *
 * Parent links are derived from the children lists, so a fixture cannot declare
 * a tree that disagrees with itself — which is the thing validation exists to
 * catch and not the thing most of these tests are about.
 */
export function documentOf(root: string, specs: readonly NodeSpec[]): CheckoutSchema {
  const base = createDocument({
    projectId: "prj_test",
    pageId: "pge_test",
    themeId: DEFAULT_THEME_ID,
  })
  const parents = new Map<string, string>()

  for (const spec of specs) {
    for (const child of spec.children ?? []) parents.set(child, spec.id)
  }

  const nodes: Record<string, Node> = {}

  for (const spec of specs) {
    nodes[spec.id] = {
      id: spec.id,
      type: spec.type ?? "core.section",
      parentId: parents.get(spec.id) ?? null,
      children: [...(spec.children ?? [])],
      props: spec.props ?? {},
      styles: spec.styles ?? {},
      visibility: { hidden: false, ...spec.visibility },
      animations: [],
      metadata: { locked: false },
    }
  }

  return { ...base, root, nodes }
}

/** Root, one section, one text. The shape most tests need. */
export function sampleDocument(styles: ResponsiveStyles = {}): CheckoutSchema {
  return documentOf("page", [
    { id: "page", type: "core.page", children: ["section"] },
    { id: "section", type: "core.section", children: ["text"], styles },
    { id: "text", type: "core.text", props: { text: "Pay now" } },
  ])
}

/** A tree `depth` levels deep, each node holding the next. */
export function deepDocument(depth: number): CheckoutSchema {
  const specs: NodeSpec[] = []

  for (let level = 0; level < depth; level += 1) {
    const id = `n${level}`
    specs.push(
      level === depth - 1
        ? { id, type: "core.text", props: { text: `${level}` } }
        : { id, type: level === 0 ? "core.page" : "core.section", children: [`n${level + 1}`] },
    )
  }

  return documentOf("n0", specs)
}

/** A root with `count` text children. */
export function wideDocument(count: number, styles: ResponsiveStyles = {}): CheckoutSchema {
  const children = Array.from({ length: count }, (_, index) => `t${index}`)

  return documentOf("page", [
    { id: "page", type: "core.page", children },
    ...children.map((id) => ({ id, type: "core.text", styles, props: { text: id } })),
  ])
}

export function contextFor(
  document: CheckoutSchema,
  overrides: Partial<RenderContextInput> = {},
): RenderContext {
  return createRenderContext({
    document,
    theme,
    registry: standardRegistry(),
    mode: "published",
    ...overrides,
  })
}

/** Styles for one breakpoint's base state. */
export function at(breakpoint: Breakpoint, properties: StyleProperties): ResponsiveStyles {
  return { [breakpoint]: { base: properties } }
}

/** A theme slot whose values map straight onto CSS, for testing stage 1. */
export const boxSlot = {
  label: "Box",
  schema: z.object({ background: z.string().optional(), radius: z.string().optional() }),
  defaults: { background: "{colors.surface}", radius: "{radius.md}" },
  toStyles: (slot: Readonly<Record<string, unknown>>): StyleProperties => ({
    backgroundColor: String(slot["background"]),
    borderRadius: String(slot["radius"]),
  }),
}

/** Freezes a value and everything under it, so a mutation throws instead of passing. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value

  for (const entry of Object.values(value)) deepFreeze(entry)

  return Object.freeze(value)
}
