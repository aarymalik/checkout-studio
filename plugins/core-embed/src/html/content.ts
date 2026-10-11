import { safeHref } from "@checkout-studio/plugin-sdk"

import { attributeAllowed, HTML_TAG_SET, MAX_DEPTH, VOID_TAG_SET } from "./tree"
import type { HtmlNode, HtmlTag } from "./tree"

/**
 * A stored value, read as a tree — once, for everything that needs one.
 *
 * ## One check, not three
 *
 * The first version had a parser-side allowlist, a schema that re-checked the
 * stored tree, and a renderer that checked each tag and attribute again. Two
 * of those were the same check and one of them was unreachable: the schema
 * ran first and returned an empty tree, so the renderer's own guard could
 * never fire. A test written to prove the guard worked passed because the
 * schema had already caught the thing.
 *
 * It was also expensive in the place it could least afford to be. The schema
 * was Zod, the renderer entry imports it, and the renderer entry is what a
 * customer downloads — a validation library in a 60 KB budget, for a lookup
 * in a set.
 *
 * So there is one walk, here, with no dependencies. The renderer calls it for
 * the tree and `validate` calls it for the reason, which means publishing
 * refuses exactly what rendering would have dropped.
 *
 * ## It assumes nothing about its input
 *
 * The value arrives from a node's props: a database row, an import, a
 * template, another person's workspace. It is `unknown` and is treated that
 * way — every field is checked before it is read, and anything unrecognised
 * is a reason rather than a crash.
 */

export interface ReadResult {
  /** What may be rendered. Empty when nothing may be. */
  content: HtmlNode[]
  /**
   * Why the stored value is not renderable, or null.
   *
   * Absent content is not a problem — a block nobody has typed into yet is a
   * normal state — so this is only set when something is there and wrong.
   */
  problem: string | null
}

export function readContent(value: unknown): ReadResult {
  if (value === undefined || value === null) return { content: [], problem: null }

  if (!Array.isArray(value)) {
    return { content: [], problem: "This block's content is not a list of elements." }
  }

  const problems: string[] = []
  const content = nodesOf(value, 1, problems)

  return { content, problem: problems[0] ?? null }
}

function nodesOf(value: readonly unknown[], depth: number, problems: string[]): HtmlNode[] {
  if (depth > MAX_DEPTH) {
    problems.push("This block's HTML is nested too deeply to render.")

    return []
  }

  return value.flatMap((entry) => nodeOf(entry, depth, problems))
}

function nodeOf(value: unknown, depth: number, problems: string[]): HtmlNode[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    problems.push("This block's content holds something that is not an element.")

    return []
  }

  const record = value as Record<string, unknown>

  if ("text" in record) return textOf(record, problems)

  const tag = record["tag"]

  if (typeof tag !== "string") {
    problems.push("This block's content holds an element with no tag.")

    return []
  }

  const children = childrenOf(record, tag, depth, problems)

  if (!HTML_TAG_SET.has(tag)) {
    problems.push(`\`${tag}\` is not an element this block may contain.`)

    /*
     * Unwrapped: the element goes and its words stay, which is what the
     * parser does with a tag it does not know. A tree that somehow arrives
     * with something unexpected in it still renders the author's copy.
     */
    return children
  }

  const attrs = attributesOf(record, tag, problems)

  return [
    {
      tag: tag as HtmlTag,
      ...(Object.keys(attrs).length === 0 ? {} : { attrs }),
      ...(children.length === 0 ? {} : { children }),
    },
  ]
}

function textOf(record: Record<string, unknown>, problems: string[]): HtmlNode[] {
  const text = record["text"]

  if (typeof text !== "string") {
    problems.push("This block's content holds text that is not text.")

    return []
  }

  // A text node with anything else on it was written by hand. Rendering the
  // half that parses is how a tampered document gets a foot in the door.
  if (Object.keys(record).length > 1) {
    problems.push("This block's content holds text with fields on it.")

    return []
  }

  return [{ text }]
}

function childrenOf(
  record: Record<string, unknown>,
  tag: string,
  depth: number,
  problems: string[],
): HtmlNode[] {
  const children = record["children"]

  if (children === undefined) return []

  if (!Array.isArray(children)) {
    problems.push(`\`${tag}\` has children that are not a list.`)

    return []
  }

  if (VOID_TAG_SET.has(tag)) {
    if (children.length > 0) problems.push(`\`${tag}\` cannot hold children.`)

    return []
  }

  return nodesOf(children, depth + 1, problems)
}

function attributesOf(
  record: Record<string, unknown>,
  tag: string,
  problems: string[],
): Record<string, string> {
  const attrs = record["attrs"]

  if (attrs === undefined) return {}

  if (typeof attrs !== "object" || attrs === null || Array.isArray(attrs)) {
    problems.push(`\`${tag}\` has attributes that are not a set of names and values.`)

    return {}
  }

  const kept: Record<string, string> = {}

  for (const [name, value] of Object.entries(attrs)) {
    if (!attributeAllowed(tag, name)) {
      problems.push(`\`${tag}\` may not carry \`${name}\`.`)
      continue
    }

    if (typeof value !== "string") {
      problems.push(`\`${name}\` is not a value.`)
      continue
    }

    /*
     * The one attribute whose value can still be a script.
     *
     * Every other name on the allowlist is safe whatever it holds — a class
     * is a class. `href="javascript:…"` runs when somebody clicks it, so it
     * is checked here rather than at render: this walk is what publishing
     * asks, and a destination that will not render should be something the
     * merchant is told about before their page is live.
     */
    if (name === "href") {
      const href = safeHref(value)

      if (href === null) {
        problems.push("A link in this block has a destination that will not be used.")
        continue
      }

      kept[name] = href
      continue
    }

    kept[name] = value
  }

  return kept
}
