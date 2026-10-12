import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"

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

export { parseHtml } from "./html/parse"
export type { ParseResult } from "./html/parse"
export { serializeHtml } from "./html/serialize"
export { parseCss } from "./css/parse"
export type { CssParseResult, CssRule } from "./css/parse"
export { serializeCss } from "./css/serialize"
