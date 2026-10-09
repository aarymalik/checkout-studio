import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { backgroundImageStyle } from "../background"
import { emptyContainerStyle } from "../empty"

/** Columns — equal-width columns side by side. A `<div>`, like the rest. */
export function ColumnsRenderer({
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
