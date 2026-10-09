import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

/**
 * Divider — a visual separator.
 *
 * An `<hr>`, which is a separator in the accessibility tree as well as on
 * screen: a screen reader announces it, so somebody listening to a checkout
 * hears the same break in the page that somebody looking at it sees. A styled
 * `<div>` would be invisible to them.
 *
 * It holds no children and takes no content.
 */
export function DividerRenderer({ className }: ComponentRenderProps): ReactElement {
  return <hr className={className} />
}
