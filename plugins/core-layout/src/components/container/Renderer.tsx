import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { backgroundImageStyle } from "../background"
import { emptyContainerStyle } from "../empty"

/**
 * Container — limits content width.
 *
 * A `<div>`, because it has no meaning beyond holding things. A Section says
 * "this is a part of the page" and carries `<section>`; this says "the text in
 * here should not run to 1400px", which is typography rather than structure.
 */
export function ContainerRenderer({
  className,
  children,
  props,
  node,
  mode,
}: ComponentRenderProps): ReactElement {
  return (
    <div
      className={className}
      style={{
        ...backgroundImageStyle(props["backgroundImage"]),
        ...emptyContainerStyle(node, mode),
      }}
    >
      {children}
    </div>
  )
}
