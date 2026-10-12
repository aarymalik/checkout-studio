import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { readContent } from "../../html/content"
import { HtmlBlockRenderer } from "./Renderer"
import { HTML_BLOCK_TYPOGRAPHY } from "./typography"

/**
 * HTML Block's registration.
 *
 * `interactive: false`, like everything else in the core plugins. The tree
 * cannot contain a script — html/tree.ts is the whole argument — so there is
 * nothing here that needs a client.
 *
 * `container: false` although it renders a subtree. A container is something
 * the canvas can drop a node into, and the subtree here is a prop rather than
 * children: dropping a Button inside somebody's markup would have no place in
 * the tree to land.
 *
 * `validate` runs on the publish path as well as in the editor, which is what
 * makes it the enforcement point for a tree that did not come from the parser
 * — an import, a template, a hand-edited document.
 */
export const htmlBlock: ComponentDefinition = {
  type: "core.html-block",
  name: "HTML Block",
  category: "Utility",
  interactive: false,
  container: false,
  defaultProps: { content: [] },
  defaultStyles: { display: "block" },
  /*
   * The elements inside a block are not nodes, so the cascade does not reach
   * them. Without these a merchant's `<h2>` renders at body size — see
   * typography.ts, and the screenshot that showed it.
   */
  descendantStyles: HTML_BLOCK_TYPOGRAPHY,
  renderer: HtmlBlockRenderer,
  validate: (node) => readContent(node.props["content"]).problem,
}
