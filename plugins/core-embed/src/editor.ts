import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

import { parseCss } from "./css/parse"
import type { CssRule } from "./css/parse"
import { serializeCss } from "./css/serialize"
import { parseHtml } from "./html/parse"
import { serializeHtml } from "./html/serialize"
import type { HtmlNode } from "./html/tree"

import { codeBlockProperties } from "./components/code-block/properties"
import { embedProperties } from "./components/embed/properties"
import { htmlBlockProperties } from "./components/html-block/properties"

/**
 * The editor half: property definitions, and the markup parser.
 *
 * `parseHtml` is exported here because the `markup` control calls it — the
 * control edits HTML and the prop holds the tree that survived the allowlist,
 * and the conversion between them belongs to the editor. The inspector that
 * will call it arrives in Phase 12.
 */
export const coreEmbedProperties: ReadonlyMap<string, readonly PropertyDefinition[]> = new Map([
  ["core.html-block", htmlBlockProperties],
  ["core.code-block", codeBlockProperties],
  ["core.embed", embedProperties],
])

/**
 * How a markup property turns into text and back.
 *
 * Both of these properties hold a structure the control produces from text —
 * the HTML becomes a tree, the CSS becomes a list of rules — and only this
 * plugin knows which is which. Nothing in a property definition says, and
 * nothing should: a definition is data, and the grammar is this plugin's.
 *
 * Keyed by component type and property key together, because `content` means
 * HTML on both blocks while `styles` on the same component means CSS.
 *
 * The application assembles these the way it assembles the property
 * definitions, and hands the editor the text. The editor stays unable to tell
 * HTML from CSS, which is the point: it draws a code box and reports what was
 * typed into it.
 */
export interface MarkupCodec {
  /** The structure the document holds, as the text somebody edits. */
  toText: (value: unknown) => string
  /** That text, as the structure to store — and what was taken out of it. */
  fromText: (text: string) => { value: unknown; removed: readonly string[] }
}

export const coreEmbedMarkup: ReadonlyMap<string, MarkupCodec> = new Map([
  [
    "core.html-block:content",
    {
      toText: (value) => serializeHtml(asNodes(value)),
      fromText: (text) => {
        const parsed = parseHtml(text)

        return { value: parsed.content, removed: parsed.removed }
      },
    },
  ],
  [
    "core.code-block:content",
    {
      toText: (value) => serializeHtml(asNodes(value)),
      fromText: (text) => {
        const parsed = parseHtml(text)

        return { value: parsed.content, removed: parsed.removed }
      },
    },
  ],
  [
    "core.code-block:styles",
    {
      toText: (value) => serializeCss(asRules(value)),
      fromText: (text) => {
        const parsed = parseCss(text)

        return { value: parsed.rules, removed: parsed.removed }
      },
    },
  ],
])

/*
 * A document is whatever was last written to it, including by a version of
 * this plugin that stored something else. Anything that is not the shape these
 * serialisers take is read as empty rather than thrown over: a component that
 * cannot be opened in the inspector is worse than one that opens blank.
 */
function asNodes(value: unknown): readonly HtmlNode[] {
  return Array.isArray(value) ? (value as readonly HtmlNode[]) : []
}

function asRules(value: unknown): readonly CssRule[] {
  return Array.isArray(value) ? (value as readonly CssRule[]) : []
}

export { parseHtml } from "./html/parse"
export type { ParseResult } from "./html/parse"
export { serializeHtml } from "./html/serialize"
export { parseCss } from "./css/parse"
export type { CssParseResult, CssRule } from "./css/parse"
export { serializeCss } from "./css/serialize"
