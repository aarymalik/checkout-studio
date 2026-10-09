import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { textOf } from "../text"

/**
 * Text — paragraph content.
 *
 * A `<p>`, and the whitespace is deliberate: `whiteSpace: "pre-wrap"` in the
 * defaults means a line break somebody typed is a line break on the page.
 * Without it a paragraph written over three lines renders as one, and the user
 * has no way to find out why short of reading CSS.
 *
 * **Rich formatting is not built.** The catalog gives Text "everything from
 * Heading, plus lists, links and rich formatting". The first is here; the rest
 * need a representation for inline marks, and the schema has none — `PropValue`
 * could hold one, but what shape it takes decides what the inline editor in
 * Phase 12 can do, and inventing it from the renderer's side would be deciding
 * that by accident. See docs/component-library.md.
 */
export function TextRenderer({ className, props }: ComponentRenderProps): ReactElement {
  return <p className={className}>{textOf(props)}</p>
}
