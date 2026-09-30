import type { CheckoutSchema, Node } from "../src/document/schema"

/**
 * Documents to test against.
 *
 * Built rather than written out, because a test that needs a 2,000-node tree
 * and a test that needs three nodes want the same shape at different sizes.
 */

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

/** Replaces a node in place, for building the broken documents validation must catch. */
export function withNodeAt(
  document: CheckoutSchema,
  id: string,
  change: Partial<Node>,
): CheckoutSchema {
  return { ...document, nodes: { ...document.nodes, [id]: { ...nodeAt(document, id), ...change } } }
}

export function makeNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: "core.container",
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
    ...overrides,
  }
}

export function makeDocument(nodes: readonly Node[], root = "root"): CheckoutSchema {
  return {
    version: "1.0.0",
    projectId: "prj_test",
    pageId: "pag_test",
    theme: { themeId: "theme_test" },
    settings: {},
    variables: {},
    root,
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
  }
}

/**
 * root
 *  ├── section
 *  │    ├── heading
 *  │    └── text
 *  └── footer
 */
export function sampleDocument(): CheckoutSchema {
  return makeDocument([
    makeNode("root", { type: "core.page", children: ["section", "footer"] }),
    makeNode("section", { type: "core.section", parentId: "root", children: ["heading", "text"] }),
    makeNode("heading", { type: "core.heading", parentId: "section" }),
    makeNode("text", { type: "core.text", parentId: "section" }),
    makeNode("footer", { type: "core.section", parentId: "root" }),
  ])
}

/** A wide, shallow tree of `count` leaves under the root. */
export function wideDocument(count: number): CheckoutSchema {
  const leaves = Array.from({ length: count }, (_, index) =>
    makeNode(`leaf${index}`, { type: "core.text", parentId: "root" }),
  )

  return makeDocument([
    makeNode("root", { type: "core.page", children: leaves.map((leaf) => leaf.id) }),
    ...leaves,
  ])
}

/** A chain `count` deep, each node holding the next. */
export function deepDocument(count: number): CheckoutSchema {
  const nodes: Node[] = [makeNode("root", { type: "core.page", children: ["n0"] })]

  for (let index = 0; index < count; index += 1) {
    nodes.push(
      makeNode(`n${index}`, {
        type: "core.container",
        parentId: index === 0 ? "root" : `n${index - 1}`,
        children: index === count - 1 ? [] : [`n${index + 1}`],
      }),
    )
  }

  return makeDocument(nodes)
}

/** A random source that walks the alphabet, so ids are predictable. */
export function sequentialRandom(): () => number {
  let step = 0

  return () => {
    const value = (step % 31) / 31
    step += 1

    return value
  }
}
