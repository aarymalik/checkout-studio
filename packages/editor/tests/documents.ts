import type { CheckoutSchema, Node } from "@checkout-studio/schema"

/**
 * Documents to test against, built from a flat list.
 *
 * Parent links are derived from the children arrays, so a fixture cannot
 * declare a tree that disagrees with itself — which is the thing validation
 * exists to catch and not the thing the canvas or the layers panel is about.
 */

export interface NodeSpec {
  id: string
  type?: string
  children?: readonly string[]
  name?: string
  locked?: boolean
  hidden?: boolean
}

export function documentOf(root: string, specs: readonly NodeSpec[]): CheckoutSchema {
  const parents = new Map<string, string>()

  for (const spec of specs) {
    for (const child of spec.children ?? []) parents.set(child, spec.id)
  }

  const nodes: Record<string, Node> = {}

  for (const spec of specs) {
    nodes[spec.id] = {
      id: spec.id,
      type: spec.type ?? "core.container",
      parentId: parents.get(spec.id) ?? null,
      children: [...(spec.children ?? [])],
      props: {},
      styles: {},
      visibility: { hidden: spec.hidden ?? false },
      animations: [],
      metadata: {
        locked: spec.locked ?? false,
        ...(spec.name === undefined ? {} : { name: spec.name }),
      },
    }
  }

  return {
    version: "1.0.0",
    projectId: "prj_test",
    pageId: "pag_test",
    theme: { themeId: "theme_test" },
    settings: {},
    variables: {},
    root,
    nodes,
  }
}

/**
 * A node the test knows is there.
 *
 * `document.nodes[id]` is `Node | undefined`, which is right for production
 * code and noise in a test that just built the document it is reading.
 */
export function nodeAt(document: CheckoutSchema, id: string): Node {
  const node = document.nodes[id]

  if (node === undefined) throw new Error(`The fixture has no node "${id}".`)

  return node
}
