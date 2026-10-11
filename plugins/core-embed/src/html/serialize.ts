import { BLOCK_TAG_SET, VOID_TAG_SET } from "./tree"
import type { HtmlNode } from "./tree"

/**
 * A stored tree, back as markup, for the editor to put in a textarea.
 *
 * ## Why the stored value is not the author's own text
 *
 * The alternative is to keep what they typed in a second prop and render the
 * tree. That stores the same content twice, lets the two drift, and ships the
 * unused copy to every customer inside the published document.
 *
 * The cost of not doing that is this file, and a reopened block showing the
 * markup that survived the allowlist rather than the markup that was pasted.
 * Which is the more honest of the two: the editor is showing what the page
 * will actually render.
 *
 * ## This is not a sanitiser round trip
 *
 * Writing markup and parsing it again is the shape of mutation XSS, where the
 * second parse reads something the first did not mean. It is a vulnerability
 * when the output goes to `innerHTML`. This output goes into a textarea's
 * value — text, never parsed by anything — and if the author edits it, it
 * comes back through the same allowlist as any other paste.
 *
 * Editor-side: the renderer has a tree already and no reason to carry this.
 *
 * ## Where it may break a line, and where it may not
 *
 * Indentation is whitespace, and whitespace inside inline content is content.
 * The first version indented everything, so `<p>Pay <strong>today</strong></p>`
 * came back as three lines — and re-parsing those lines put the newlines and
 * the leading spaces inside the text. A merchant who opened a block and saved
 * it unchanged would have changed it, and again the next time.
 *
 * So an element is broken across lines only when every one of its children is
 * a block element, where the surrounding whitespace is the markup's own
 * formatting and the parser drops it. Anything else is written on one line,
 * exactly as it is stored.
 */

/** Characters that would otherwise read as markup when the text is re-parsed. */
function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;")
}

export function serializeHtml(content: readonly HtmlNode[], indent = ""): string {
  return content.map((node) => indent + serializeNode(node, indent)).join("\n")
}

/** Whether this element's children may be put on their own lines. */
function breakable(children: readonly HtmlNode[]): boolean {
  return children.every((child) => "tag" in child && BLOCK_TAG_SET.has(child.tag))
}

function serializeNode(node: HtmlNode, indent: string): string {
  if ("text" in node) return escapeText(node.text)

  const attrs = Object.entries(node.attrs ?? {})
    .map(([name, value]) => (value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`))
    .join("")
  const open = `<${node.tag}${attrs}>`

  if (VOID_TAG_SET.has(node.tag)) return open

  const children = node.children ?? []

  if (children.length === 0) return `${open}</${node.tag}>`

  if (breakable(children)) {
    return [open, serializeHtml(children, `${indent}  `), `${indent}</${node.tag}>`].join("\n")
  }

  return `${open}${children.map((child) => serializeNode(child, indent)).join("")}</${node.tag}>`
}
