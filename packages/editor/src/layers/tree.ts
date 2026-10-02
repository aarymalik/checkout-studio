import { UNSUPPORTED_TYPE, traverse } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"

/**
 * The document, flattened into the rows a layers panel draws.
 *
 * Flat rather than nested, because the panel is virtualized: only the rows in
 * view are rendered, and you cannot window a tree of nested components without
 * first knowing what the visible sequence is. The indentation is a number on
 * each row rather than a wrapper element.
 *
 * See docs/editor-behavior.md § Layer Panel.
 */

export interface LayerRow {
  id: string
  type: string
  /** The name the user gave it, or the component's own. */
  label: string
  /** Root is 0. */
  depth: number
  /** Position among its siblings, for a reorder to describe itself. */
  index: number
  parentId: string | null
  hasChildren: boolean
  expanded: boolean
  locked: boolean
  hidden: boolean
  /**
   * Hidden because an ancestor is.
   *
   * Drawn differently from a node the user hid: the eye-off icon belongs to
   * whoever switched it off, and showing it on every descendant would suggest
   * nine separate decisions where there was one.
   */
  inheritedHidden: boolean
}

/** The ids whose children are showing. Absent means collapsed. */
export type Expansion = ReadonlySet<string>

/**
 * A node's label.
 *
 * The name if it has one, then a readable form of its type. `core.order-summary`
 * becomes "Order summary", which is what the panel should say — the type id is
 * for the inspector's advanced section, not for a tree the user reads all day.
 */
export function labelFor(node: Node): string {
  const named = node.metadata.name

  if (named !== undefined && named.trim() !== "") return named.trim()

  const name = node.type.slice(node.type.indexOf(".") + 1)
  const spaced = name.replace(/-/g, " ")

  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Every row the panel would show, in document order.
 *
 * A collapsed node's descendants are left out entirely rather than marked
 * invisible, so the window arithmetic counts only rows that exist.
 */
export function flatten(
  document: CheckoutSchema,
  expanded: Expansion,
  options: { includeRoot?: boolean } = {},
): readonly LayerRow[] {
  const includeRoot = options.includeRoot ?? true
  const rows: LayerRow[] = []
  const collapsed = new Set<string>()
  const hiddenAncestors = new Set<string>()

  traverse(document, ({ node, depth, index }) => {
    const parentId = node.parentId

    // Inside something collapsed, or inside something already left out.
    if (parentId !== null && collapsed.has(parentId)) {
      collapsed.add(node.id)
      return
    }

    if (parentId !== null && hiddenAncestors.has(parentId)) hiddenAncestors.add(node.id)
    if (node.visibility.hidden) hiddenAncestors.add(node.id)

    const isExpanded = expanded.has(node.id)

    if (!isExpanded) collapsed.add(node.id)

    if (node.id === document.root && !includeRoot) return

    rows.push({
      id: node.id,
      type: node.type,
      label: labelFor(node),
      depth: includeRoot ? depth : depth - 1,
      index,
      parentId,
      hasChildren: node.children.length > 0,
      expanded: isExpanded,
      locked: node.metadata.locked,
      hidden: node.visibility.hidden,
      inheritedHidden:
        !node.visibility.hidden && parentId !== null && hiddenAncestors.has(parentId),
    })
  })

  return rows
}

/**
 * The ids that must be expanded for every one of `ids` to be on screen.
 *
 * What selecting something on the canvas needs: the panel has to reveal it, and
 * revealing it means expanding every ancestor rather than scrolling to a row
 * that is not rendered.
 */
export function expansionFor(
  document: CheckoutSchema,
  ids: Iterable<string>,
  current: Expansion,
): Expansion {
  const next = new Set(current)

  for (const id of ids) {
    let parentId = document.nodes[id]?.parentId

    while (parentId !== null && parentId !== undefined) {
      next.add(parentId)
      parentId = document.nodes[parentId]?.parentId
    }
  }

  return next
}

/** Everything expanded. What a freshly opened panel shows. */
export function expandAll(document: CheckoutSchema): Expansion {
  const ids = new Set<string>()

  traverse(document, ({ node }) => {
    if (node.children.length > 0) ids.add(node.id)
  })

  return ids
}

/** Whether a row is a recovered node, which the panel marks as needing a plugin. */
export function isUnsupported(row: LayerRow): boolean {
  return row.type === UNSUPPORTED_TYPE
}
