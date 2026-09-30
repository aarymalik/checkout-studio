import type { ReactElement, ReactNode } from "react"
import type { RenderMode } from "@checkout-studio/plugin-sdk"

import { behaviourOf } from "./modes"

/**
 * `core.unsupported` — what a node becomes when nothing can render it.
 *
 * Either its plugin is not installed, or its type was never known here. Both
 * are recoverable: the node's data is untouched in the document, so installing
 * the plugin brings the node back exactly as it was. Nothing is lost and
 * nothing needs repairing.
 *
 * In the editor it is a visible placeholder naming the type, because the user
 * has to see it to act on it. On a live checkout it renders an empty box at the
 * node's reserved space — invisible to the customer, and not a reflow.
 *
 * See docs/renderer.md § Fallback Component.
 */

export interface UnsupportedProps {
  type: string
  className: string
  mode: RenderMode
  /**
   * The node's children, rendered.
   *
   * A missing plugin costs its own frame and not what is inside it. A bare box
   * is a poor approximation of whatever the plugin would have laid out, and a
   * far better outcome than a blank page below the node.
   */
  children?: ReactNode | undefined
}

export function Unsupported({ type, className, mode, children }: UnsupportedProps): ReactElement {
  if (!behaviourOf(mode).visibleFallbacks) {
    return (
      <div className={className} data-ck-unsupported={type}>
        {children}
      </div>
    )
  }

  return (
    <div className={className} data-ck-unsupported={type} role="note">
      <strong>Not available</strong>
      <span>
        {"“"}
        {type}
        {
          "” needs a plugin that is not installed. Its content is safe and will come back when the plugin does."
        }
      </span>
      {children}
    </div>
  )
}
