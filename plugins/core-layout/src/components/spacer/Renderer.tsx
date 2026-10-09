import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

/**
 * Spacer — space, and nothing else.
 *
 * `aria-hidden`, because it has nothing to announce. A screen reader reading
 * "group" for every gap somebody put between two sections is a page that takes
 * three times as long to listen to and says no more.
 *
 * It holds no children: space with something in it is a Stack with padding,
 * and offering both would be two ways to do one thing.
 */
export function SpacerRenderer({ className }: ComponentRenderProps): ReactElement {
  return <div aria-hidden className={className} />
}
