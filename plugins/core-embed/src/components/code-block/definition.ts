import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { readContent } from "../../html/content"
import { readRules } from "../../css/rules"
import { blockStyles } from "../../html/typography"
import { CodeBlockRenderer } from "./Renderer"

/**
 * Code Block's registration.
 *
 * ## Its CSS reaches its own contents and nothing else
 *
 * The catalog says "scoped to `.checkout-root`" — the whole page. That is not
 * what this does, and the reason is the page it would be scoped to.
 *
 * A merchant can already give any node any style, including `position: fixed`,
 * through the inspector: `styleProperties` is an open record by design. So
 * CSS here is not a new capability, it is more reach — one rule instead of one
 * node. On a page that carries a payment form, reach is the part that matters:
 * a rule matching more than its author expected can cover the Stripe element,
 * hide the amount, or hide an error, and a document does not always come from
 * the merchant whose page it is. It arrives from an import, a template, and in
 * a workspace from another person.
 *
 * Scoped to the block, the component still does what it is for — style the
 * markup in this block — and a rule cannot reach what the author was not
 * looking at. Recorded in docs/component-library.md § Code Block.
 *
 * ## Per node, not per type
 *
 * `descendantStyles` as a function: two Code Blocks on a page are two
 * stylesheets, each written against its own node's class.
 */
export const codeBlock: ComponentDefinition = {
  type: "core.code-block",
  name: "Code Block",
  category: "Utility",
  interactive: false,
  container: false,
  defaultProps: { content: [], styles: [] },
  defaultStyles: { display: "block" },
  /*
   * The theme's typography for the markup, and the author's rules over it.
   * A block whose CSS replaced the typography would have the author's rule
   * working and the heading at body size — see `blockStyles`.
   */
  descendantStyles: (node) => blockStyles(readRules(node.props["styles"]).styles),
  renderer: CodeBlockRenderer,
  validate: (node) =>
    readContent(node.props["content"]).problem ?? readRules(node.props["styles"]).problem,
}
