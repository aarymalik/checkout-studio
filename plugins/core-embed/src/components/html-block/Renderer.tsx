import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { readContent } from "../../html/content"
import { renderHtmlContent } from "../../html/render"

/**
 * HTML Block.
 *
 * Renders the tree in `content`, which the editor produced from markup the
 * author typed — see html/tree.ts for why the stored value is a tree and not
 * the markup itself.
 *
 * Empty is a real state and not an error. A block somebody has just dropped
 * has no content yet, and the editor needs something with a box to select; a
 * published page renders nothing at all rather than an empty `<div>` that
 * takes up its padding.
 */
export function HtmlBlockRenderer({
  className,
  props,
  mode,
}: ComponentRenderProps): ReactElement | null {
  const { content } = readContent(props["content"])

  if (content.length === 0) {
    return mode === "editor-preview" ? <div className={className} data-ck-empty-html /> : null
  }

  return <div className={className}>{renderHtmlContent(content)}</div>
}
