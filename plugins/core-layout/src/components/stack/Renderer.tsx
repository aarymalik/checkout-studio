import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { backgroundImageStyle } from "../background"
import { emptyContainerStyle } from "../empty"

/** Stack — a flex row or column. A `<div>`: an arrangement carries no meaning. */
export function StackRenderer({
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
