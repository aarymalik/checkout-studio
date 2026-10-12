import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { readContent } from "../../html/content"
import { renderHtmlContent } from "../../html/render"

/**
 * Code Block.
 *
 * The markup half is HTML Block's, element for element: the same tree, the
 * same reader, the same renderer. What this component adds is a stylesheet of
 * its own, and that is not rendered here — the engine writes it, scoped to
 * this node's class, from `descendantStyles` on the definition.
 *
 * Which is why there is no `<style>` tag anywhere in this plugin. A component
 * writing one would be schema content reaching the page as CSS without the
 * engine's selector and value checks, and the renderer writes raw markup in
 * exactly one file.
 */
export function CodeBlockRenderer({
  className,
  props,
  mode,
}: ComponentRenderProps): ReactElement | null {
  const { content } = readContent(props["content"])

  if (content.length === 0) {
    return mode === "editor-preview" ? <div className={className} data-ck-empty-code /> : null
  }

  return <div className={className}>{renderHtmlContent(content)}</div>
}
