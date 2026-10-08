import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { backgroundImageStyle } from "../background"
import { emptyContainerStyle } from "../empty"

/**
 * Section — the top-level layout container.
 *
 * A `<section>`, because that is what docs/component-library.md says it is and
 * because the element carries the meaning: a screen reader user moving by
 * region gets the page's structure for free. It takes no accessible name here,
 * so it stays a generic container rather than announcing itself as a landmark
 * with no label — a page of six unnamed regions is worse to navigate than a
 * page of none.
 *
 * `className` is the renderer's: every resolved style for this node is already
 * in a class, which is what keeps pan and zoom free of per-node work. The only
 * inline styles are the ones that cannot be a class, because they come from a
 * resolved asset or from the mode.
 */
export function SectionRenderer({
  className,
  children,
  props,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  return (
    <section
      className={className}
      style={{
        ...backgroundImageStyle(props["backgroundImage"]),
        ...emptyContainerStyle(node, mode),
      }}
    >
      {children}
    </section>
  )
}
