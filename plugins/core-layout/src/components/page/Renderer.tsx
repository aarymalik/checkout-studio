import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { backgroundImageStyle } from "../background"

/**
 * Page — every document's root.
 *
 * ## The element depends on the mode, and has to
 *
 * On a page we own, this is the `<main>` landmark: it is the document's
 * content, and a keyboard user's "skip to main content" has to land somewhere.
 *
 * In the editor it is a `<div>`. The studio shell already has a `<main>` around
 * the canvas, and a second one inside it is two main landmarks on one page —
 * an axe violation and, worse, a screen reader user being told there are two
 * places the content might be. An embedded checkout is a `<div>` for the same
 * reason: the page it is dropped into is somebody else's, and we do not know
 * what landmarks they already have.
 */
export function PageRenderer({
  className,
  children,
  props,
  mode,
}: ComponentRenderProps): ReactElement {
  const style = backgroundImageStyle(props["backgroundImage"])

  if (mode === "editor-preview" || mode === "embed") {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <main className={className} style={style}>
      {children}
    </main>
  )
}
