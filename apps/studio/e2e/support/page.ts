import { prisma } from "@checkout-studio/database"
import { createDocument, serialize } from "@checkout-studio/schema"
import type { Node } from "@checkout-studio/schema"

/**
 * A page with a document in it.
 *
 * Written through the repository rather than through the API service: the
 * service's module graph reaches a CommonJS patch library whose named exports
 * Node cannot see from here, and what these fixtures need is a row, not a code
 * path.
 *
 * A blank page is a root and nothing else, which is correct and gives a test
 * nothing to act on — the root is not selectable, and a tree with no rows has
 * nothing to reorder. So the nodes are given here.
 */

export interface PageNode {
  id: string
  type: string
  children?: readonly string[]
  /** The name the user would have given it, for the panels that show one. */
  name?: string
  styles?: Node["styles"]
}

export async function createPage(
  projectId: string,
  options: { title: string; slug: string; nodes: readonly PageNode[] },
): Promise<string> {
  const row = await prisma.page.create({
    data: {
      projectId,
      title: options.title,
      slug: options.slug,
      draftSchema: {},
    },
    select: { id: true },
  })

  const blank = createDocument({ projectId, pageId: row.id, themeId: "theme_default" })
  const root = blank.nodes[blank.root]

  if (root === undefined) throw new Error("A new document has no root.")

  const parents = new Map<string, string>()

  for (const spec of options.nodes) {
    for (const child of spec.children ?? []) parents.set(child, spec.id)
  }

  const nodes: Record<string, Node> = {
    [blank.root]: {
      ...root,
      // Whatever nobody claimed as a child belongs to the page.
      children: options.nodes.filter((spec) => !parents.has(spec.id)).map((spec) => spec.id),
    },
  }

  for (const spec of options.nodes) {
    nodes[spec.id] = {
      id: spec.id,
      type: spec.type,
      parentId: parents.get(spec.id) ?? blank.root,
      children: [...(spec.children ?? [])],
      props: {},
      styles: spec.styles ?? {},
      visibility: { hidden: false },
      animations: [],
      metadata: { locked: false, ...(spec.name === undefined ? {} : { name: spec.name }) },
    }
  }

  const document = { ...blank, nodes }

  await prisma.page.update({
    where: { id: row.id },
    data: { draftSchema: JSON.parse(serialize(document)) as object },
  })

  return row.id
}
