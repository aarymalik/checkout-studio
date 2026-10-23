import { fuzzyMatch } from "../commands/fuzzy"
import type { InspectorSection } from "./sections"

/**
 * Filtering the inspector.
 *
 * ## The same matcher as everywhere else
 *
 * `fuzzyMatch` is what the command palette and the layers panel search with,
 * so "bgc" finds Background colour here exactly as "ordsum" finds the order
 * summary there. A search that behaved differently in each panel would be
 * three searches to learn.
 *
 * ## A group is a word people search for
 *
 * Typing "typo" means Typography, not "the properties whose labels contain
 * those letters" — and no label does. A section whose group matches is kept
 * whole, because what was asked for is the section.
 *
 * ## Nothing is reordered
 *
 * The palette sorts by score; this does not. The inspector's order is the
 * order the component registered its properties in, and docs/ui-guidelines.md
 * puts the sections in a fixed sequence. A panel that rearranged itself while
 * somebody typed would make them hunt for a control they had already found.
 */

export interface PropertySearchResult {
  sections: readonly InspectorSection[]
  /** Properties kept. Zero is the empty state; it is not the same as no query. */
  matches: number
}

export function searchProperties(
  sections: readonly InspectorSection[],
  query: string,
): PropertySearchResult {
  const trimmed = query.trim()

  if (trimmed === "") {
    return { sections, matches: sections.reduce((count, one) => count + one.properties.length, 0) }
  }

  const found: InspectorSection[] = []

  for (const section of sections) {
    // The whole section, when the section itself is what was asked for.
    const properties =
      fuzzyMatch(section.group, trimmed) !== null
        ? section.properties
        : section.properties.filter((property) => fuzzyMatch(property.label, trimmed) !== null)

    if (properties.length > 0) found.push({ group: section.group, properties })
  }

  return {
    sections: found,
    matches: found.reduce((count, one) => count + one.properties.length, 0),
  }
}
