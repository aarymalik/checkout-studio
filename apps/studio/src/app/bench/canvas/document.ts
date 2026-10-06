import { createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"

/**
 * A page of a given size, for measuring against.
 *
 * Shaped like a real one rather than a flat list: sections holding headings and
 * buttons, so the tree has depth and the measurement walks something like a
 * document somebody would actually build. A flat two thousand siblings is both
 * easier to render and unrepresentative.
 *
 * Deterministic, so two runs measure the same page.
 */
export function benchDocument(count: number): CheckoutSchema {
  const base = createDocument({
    projectId: "prj_bench",
    pageId: "pag_bench",
    themeId: "theme_default",
    random: () => 0.5,
  })
  const root = base.nodes[base.root] as Node

  const nodes: Record<string, Node> = {}
  const sections: string[] = []

  /** Eight children per section, which is about what a real page carries. */
  const perSection = 8

  for (let index = 0; index < count; index += 1) {
    const section = Math.floor(index / perSection)
    const sectionId = `section_${section}`

    if (nodes[sectionId] === undefined) {
      sections.push(sectionId)
      nodes[sectionId] = {
        id: sectionId,
        type: "core.section",
        parentId: base.root,
        children: [],
        props: {},
        styles: { desktop: { base: { minHeight: 80 } } },
        visibility: { hidden: false },
        animations: [],
        metadata: { locked: false, name: `Section ${section + 1}` },
      }
    }

    const id = `node_${index}`

    nodes[sectionId] = {
      ...(nodes[sectionId] as Node),
      children: [...(nodes[sectionId] as Node).children, id],
    }

    nodes[id] = {
      id,
      type: index % 2 === 0 ? "core.heading" : "core.button",
      parentId: sectionId,
      children: [],
      props: {},
      styles: {},
      visibility: { hidden: false },
      animations: [],
      metadata: { locked: false, name: `Node ${index + 1}` },
    }
  }

  return {
    ...base,
    nodes: {
      ...nodes,
      [base.root]: { ...root, children: sections },
    },
  }
}
