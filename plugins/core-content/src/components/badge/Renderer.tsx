import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { textOf } from "../text"

/**
 * Badge — a small label.
 *
 * A `<span>`, because a badge is a word about something next to it rather than
 * a thing of its own. `display: inline-flex` in the defaults gives it padding
 * and a radius without taking a line to itself.
 *
 * **No icon.** The catalog lists Icon as editable. An icon inside a badge would
 * need the icon set, which is `core.icon`'s — a second component in a different
 * plugin half — and a badge holding a component is a container, which a badge
 * is not. The honest arrangement is a Stack with an Icon and a Badge in it, and
 * that already works. See docs/component-library.md.
 */
export function BadgeRenderer({ className, props }: ComponentRenderProps): ReactElement {
  return <span className={className}>{textOf(props)}</span>
}
