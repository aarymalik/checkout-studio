import { createElement } from "react"
import type { ReactNode } from "react"

import { VOID_TAG_SET } from "./tree"
import type { HtmlNode } from "./tree"

/**
 * A tree, as elements.
 *
 * `createElement` rather than `dangerouslySetInnerHTML`, which is the whole
 * design: text goes in as text and React escapes it, so there is no step at
 * which a string is parsed as markup. `scripts/check-renderer-deps.mjs` allows
 * raw HTML in exactly one file and this is not it.
 *
 * It trusts the tree, and only because of where the tree comes from:
 * `readContent` is the one thing that produces an `HtmlNode`, it is total over
 * arbitrary stored JSON, and it has already dropped every tag, attribute and
 * destination that is not allowed. Checking again here is what the first
 * version did, and the second check could not fail — so what it bought was
 * the belief that something was being watched.
 */

/**
 * Attribute names, as React spells them.
 *
 * React reads `className` and `colSpan`; given `class` it renders nothing and
 * warns. The stored tree uses HTML's names because that is what the author
 * typed and what the catalog describes, so the translation happens here.
 */
const REACT_NAMES: Readonly<Record<string, string>> = {
  class: "className",
  colspan: "colSpan",
  rowspan: "rowSpan",
  datetime: "dateTime",
}

/** Attributes React wants as a number, not the string HTML stores. */
const NUMERIC = new Set(["colspan", "rowspan", "start"])

export function renderHtmlContent(content: readonly HtmlNode[]): ReactNode {
  return content.map((node, index) => renderNode(node, String(index)))
}

function renderNode(node: HtmlNode, key: string): ReactNode {
  if ("text" in node) return node.text

  const children = VOID_TAG_SET.has(node.tag) ? null : renderChildren(node.children, key)

  return createElement(node.tag, { key, ...propsOf(node.attrs) }, children)
}

function renderChildren(children: readonly HtmlNode[] | undefined, key: string): ReactNode {
  return (children ?? []).map((child, index) => renderNode(child, `${key}.${String(index)}`))
}

function propsOf(
  attrs: Readonly<Record<string, string>> | undefined,
): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {}

  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (NUMERIC.has(name)) {
      const count = Number(value)

      if (Number.isInteger(count) && count > 0) props[REACT_NAMES[name] ?? name] = count
      continue
    }

    // Boolean attributes: HTML writes presence, React writes `true`.
    if (name === "reversed") {
      props["reversed"] = true
      continue
    }

    props[REACT_NAMES[name] ?? name] = value
  }

  return props
}
