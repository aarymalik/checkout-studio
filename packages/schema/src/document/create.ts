import { createId, type RandomSource } from "./ids"
import type { CheckoutSchema, Node } from "./schema"

/**
 * A new, empty page.
 *
 * One root and nothing else. It is deliberately not a template: a page that
 * arrives with a heading and a button somebody did not ask for is a page they
 * have to empty before they can start, and templates are a feature of their
 * own with a gallery to choose from.
 *
 * See docs/schema.md § Root Node.
 */

export const ROOT_TYPE = "core.page"
export const CURRENT_VERSION = "1.0.0"

export function createDocument(input: {
  projectId: string
  pageId: string
  themeId: string
  random?: RandomSource
}): CheckoutSchema {
  const root: Node = {
    id: createId(ROOT_TYPE, new Set(), input.random),
    type: ROOT_TYPE,
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
  }

  return {
    version: CURRENT_VERSION,
    projectId: input.projectId,
    pageId: input.pageId,
    theme: { themeId: input.themeId },
    settings: {},
    variables: {},
    root: root.id,
    nodes: { [root.id]: root },
  }
}

/**
 * The same document, belonging to a different page.
 *
 * Duplicating a page keeps every node id: they are unique within a document,
 * not across the product, and regenerating them would break nothing and cost a
 * walk of the whole tree.
 */
export function rehome(
  document: CheckoutSchema,
  input: { projectId?: string; pageId: string },
): CheckoutSchema {
  return {
    ...document,
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    pageId: input.pageId,
  }
}
