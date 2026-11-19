/**
 * Narrowing the template library, in memory.
 *
 * The list arrives as a prop from a server component, the way the media
 * library's does, so filtering is a function over an array rather than a
 * request. That is what makes typing feel instant and what keeps the panel
 * free of spinners, debounces and out-of-order answers.
 *
 * The route behind it takes the same filters, which is what a larger
 * catalogue would need and what any other client would use. Reaching for it
 * here would be building for a catalogue that does not exist yet.
 */

export interface LibraryTemplate {
  id: string
  name: string
  category: string
  description: string | null
  thumbnailUrl: string | null
  tags: readonly string[]
}

export interface TemplateFilter {
  /** What is in the search box, as typed. */
  search: string
  /** The chosen category, or null for every one. */
  category: string | null
}

export const NO_FILTER: TemplateFilter = { search: "", category: null }

/** Whether anything is narrowing the library, so an empty panel can say why. */
export function isFiltered(filter: TemplateFilter): boolean {
  return filter.search.trim() !== "" || filter.category !== null
}

/**
 * The templates a filter leaves, in the order they arrived.
 *
 * Order is the server's — newest first — and not this function's. A filter
 * that also reordered would move things under the cursor of somebody who was
 * only narrowing.
 */
export function narrow(
  templates: readonly LibraryTemplate[],
  filter: TemplateFilter,
): readonly LibraryTemplate[] {
  const term = filter.search.trim().toLowerCase()

  return templates.filter((template) => {
    if (filter.category !== null && template.category !== filter.category) return false
    /*
     * A short circuit and not a rule: `matches` would answer true anyway,
     * because every string contains the empty one. Saying it here means a
     * reader does not have to work that out, and an unfiltered library does
     * not do three string comparisons per row to learn nothing.
     */
    if (term === "") return true

    return matches(template, term)
  })
}

/**
 * Name, description and tags, the same three the server searches.
 *
 * Two places that answer "does this match" have to agree, or narrowing a
 * list the server filtered would drop rows it had just said were matches.
 */
function matches(template: LibraryTemplate, term: string): boolean {
  return (
    template.name.toLowerCase().includes(term) ||
    (template.description ?? "").toLowerCase().includes(term) ||
    template.tags.some((tag) => tag.toLowerCase() === term)
  )
}

/**
 * Every category present, for a filter that cannot offer an empty one.
 *
 * Of the whole library and never of what is left after filtering: a filter
 * that narrowed its own options would leave somebody who picked one with no
 * way back to the others.
 */
export function categoriesOf(templates: readonly LibraryTemplate[]): readonly string[] {
  return [...new Set(templates.map((template) => template.category))].sort()
}
