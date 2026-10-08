import type { Node } from "@checkout-studio/schema"
import type { RenderMode } from "@checkout-studio/plugin-sdk"
import type { CSSProperties } from "react"

/**
 * An empty container still has to be somewhere.
 *
 * A `<section>` with no children is zero pixels tall, which in the editor means
 * a component the user has just inserted that they cannot see and cannot drop
 * anything into. On a published page that is correct — an empty section should
 * take no space — so the height exists in `editor-preview` and nowhere else.
 *
 * Not the "Drop Here" placeholder docs/editor-behavior.md § Empty Containers
 * asks for. That is deliberately not here: whether the words are drawn by the
 * component or by the editor's overlay layer is one decision, and putting them
 * in a component means making it seven times — once per layout component, and
 * again in every third-party container that would rather not. The editor knows
 * a node is an empty container, because the registry says the type holds
 * children and the document says this one has none.
 */
export function emptyContainerStyle(node: Node, mode: RenderMode): CSSProperties {
  if (mode !== "editor-preview" || node.children.length > 0) return {}

  return { minHeight: MINIMUM_EDITOR_HEIGHT }
}

/** Enough to aim a pointer at, and small enough not to look like content. */
const MINIMUM_EDITOR_HEIGHT = "64px"
