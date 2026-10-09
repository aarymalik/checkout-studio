import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { textGradientStyle } from "../gradient"
import { textOf } from "../text"

/** The levels a heading may be. The element is `h` plus one of these. */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const

export type HeadingLevel = (typeof HEADING_LEVELS)[number]

/**
 * The level a node asks for, or the default, never something that is not one.
 *
 * A level arrives from a document, and a document can hold anything a previous
 * version of this product wrote or a careless import produced. `h7` is not an
 * element; React would render an unknown tag and the browser would treat it as
 * an inline span, so the heading would silently stop being a heading — present
 * on screen, absent from the outline a screen reader navigates by.
 */
export function levelOf(value: unknown): HeadingLevel {
  return HEADING_LEVELS.includes(value as HeadingLevel) ? (value as HeadingLevel) : 2
}

/**
 * Heading — a title.
 *
 * The element is the level, because the level *is* the meaning: a screen reader
 * user navigates a page by its headings, and `h2` is a promise about where this
 * sits in the document. Styling a `<div>` to look like a heading leaves them
 * with a page that has no structure at all.
 *
 * Which is why size is not the level. The two are separate controls on purpose
 * — an `h2` that needs to look small is a style change, not a demotion.
 */
export function HeadingRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const Tag = `h${levelOf(props["level"])}` as "h1"

  return (
    <Tag className={className} style={textGradientStyle(props["gradient"])}>
      {textOf(props)}
    </Tag>
  )
}
