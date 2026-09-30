import type { CheckoutSchema, Node } from "@checkout-studio/schema"

import { createEditorStore, type EditorStoreApi } from "../../src/state/store"

/**
 * A store to test against.
 *
 * The clock and the random source are injected, so grouping can be tested
 * without waiting and ids are reproducible.
 */

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

/**
 * root
 *  ├── section
 *  │    ├── heading
 *  │    └── text
 *  └── footer
 */
export function sampleDocument(): CheckoutSchema {
  return {
    version: "1.0.0",
    projectId: "prj_test",
    pageId: "pag_test",
    theme: { themeId: "theme_test" },
    settings: {},
    variables: {},
    root: "root",
    nodes: Object.fromEntries(
      [
        makeNode("root", { type: "core.page", children: ["section", "footer"] }),
        makeNode("section", {
          type: "core.section",
          parentId: "root",
          children: ["heading", "text"],
        }),
        makeNode("heading", { type: "core.heading", parentId: "section" }),
        makeNode("text", { type: "core.text", parentId: "section" }),
        makeNode("footer", { type: "core.section", parentId: "root" }),
      ].map((node) => [node.id, node]),
    ),
  }
}

export function wideDocument(count: number): CheckoutSchema {
  const leaves = Array.from({ length: count }, (_, index) =>
    makeNode(`leaf${index}`, { type: "core.text", parentId: "root" }),
  )

  return {
    ...sampleDocument(),
    root: "root",
    nodes: Object.fromEntries(
      [
        makeNode("root", { type: "core.page", children: leaves.map((leaf) => leaf.id) }),
        ...leaves,
      ].map((node) => [node.id, node]),
    ),
  }
}

/** A clock the test moves by hand. */
export function makeClock(start = 1_000) {
  let time = start

  return {
    now: () => time,
    advance: (by: number) => {
      time += by
    },
  }
}

export interface TestStore {
  store: EditorStoreApi
  /** The current state, for reading. */
  state: () => ReturnType<EditorStoreApi["getState"]>
  advance: (by: number) => void
}

export function makeStore(
  document: CheckoutSchema = sampleDocument(),
  options: Partial<Parameters<typeof createEditorStore>[0]> = {},
): TestStore {
  const clock = makeClock()
  const store = createEditorStore({ document, now: clock.now, ...options })

  return { store, state: () => store.getState(), advance: clock.advance }
}
