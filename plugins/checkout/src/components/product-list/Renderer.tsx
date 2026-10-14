import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import { Children } from "react"
import type { ReactElement } from "react"

/**
 * Product List.
 *
 * ## A list, said out loud
 *
 * `<ul>` with each child in an `<li>`: a screen reader announces "list, three
 * items" before reading any of them, which is the difference between knowing
 * how many products are in an order and discovering it at the end.
 *
 * The children arrive already rendered, so they are wrapped rather than built.
 * `Children.toArray` rather than indexing into them — it is the supported way
 * to walk a `ReactNode` whatever shape it arrived in, and it gives each child
 * a stable key, so an `<li>` keyed by position cannot bind itself to the wrong
 * card when the merchant reorders two products.
 *
 * ## It ships no JavaScript
 *
 * The cards inside are interactive — each one puts its product in the cart.
 * The list is a list, so it renders on the server and hydrates nothing.
 *
 * ## An empty one still has to be somewhere
 *
 * Zero children is zero pixels, which in the editor is a component somebody
 * has just inserted that they can neither see nor drop a card into. On a
 * published page an empty list correctly takes no space, so the height exists
 * in `editor-preview` and nowhere else. The "Drop Here" wording belongs to the
 * editor's overlay, which knows a container is empty without being told.
 */

/** Enough to aim a pointer at, and small enough not to look like content. */
const MINIMUM_EDITOR_HEIGHT = "64px"

export function ProductListRenderer({
  className,
  children,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  const items = Children.toArray(children)
  const needsHeight = node.children.length === 0 && mode === "editor-preview"

  return (
    <ul
      className={className}
      style={needsHeight ? { minHeight: MINIMUM_EDITOR_HEIGHT } : undefined}
    >
      {items.map((child, index) => (
        <li key={typeof child === "object" && "key" in child ? child.key : index}>{child}</li>
      ))}
    </ul>
  )
}
